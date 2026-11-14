"""Verify the public installer and its immutable widget without executing either.

This is an explicit online distribution check, separate from offline regressions.
Only this project's canonical public Pages installer and commit-pinned widget URL
are permitted. No Ford account, vehicle service or authentication is involved.
"""
import argparse
import hashlib
import http.client
from pathlib import Path
import urllib.error
import urllib.request

from release import HASH_RE, SOURCE_RE, constant, prepare_release, script_version, version_parts


INSTALLER_URL = "https://markse123.github.io/FordPassWidgets/installer.js"
INSTALLER_LIMIT = 60_000
WIDGET_LIMIT = 1_000_000
REQUEST_TIMEOUT = 20


class HostedInstallError(ValueError):
    """Public distribution did not match the reviewed local release."""


def allowed_url(url):
    return isinstance(url, str) and (url == INSTALLER_URL or SOURCE_RE.fullmatch(url) is not None)


class RejectRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        # Both canonical endpoints serve directly. Never follow an upstream URL,
        # even when its host happens to be on the public distribution allowlist.
        raise HostedInstallError("The public download unexpectedly redirected.")


def fetch_public(url, limit, opener=None):
    if not allowed_url(url):
        raise HostedInstallError("The download URL is not an allowed public distribution URL.")
    if limit not in (INSTALLER_LIMIT, WIDGET_LIMIT):
        raise HostedInstallError("The public download size limit is invalid.")
    # Normal HTTPS certificate validation remains enabled. Do not inherit proxy
    # configuration or any authentication/cookie handler from the environment.
    if opener is None:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), RejectRedirects())
    request = urllib.request.Request(url, headers={"Accept-Encoding": "identity", "User-Agent": "FordPassWidgets-distribution-check"})
    try:
        with opener.open(request, timeout=REQUEST_TIMEOUT) as response:
            if response.status != 200 or response.geturl() != url:
                raise HostedInstallError("The public download did not return its canonical URL with HTTP 200.")
            if response.headers.get("Content-Encoding", "identity").lower() != "identity":
                raise HostedInstallError("The public download used unexpected content encoding.")
            length = response.headers.get("Content-Length")
            if length is not None and (not length.isdecimal() or int(length) > limit):
                raise HostedInstallError("The public download has an invalid or oversized content length.")
            data = response.read(limit + 1)
            if len(data) > limit:
                raise HostedInstallError("The public download exceeded its size limit.")
            if length is not None and len(data) != int(length):
                raise HostedInstallError("The public download was incomplete.")
            return data
    except (urllib.error.URLError, http.client.HTTPException, TimeoutError, OSError) as error:
        # Do not print arbitrary upstream errors, headers or response bodies.
        raise HostedInstallError("The public download failed or timed out.") from error


def installer_metadata(raw):
    code = raw.decode("utf-8")
    version = constant(code, "INSTALL_VERSION")
    source = constant(code, "INSTALL_SOURCE")
    digest = constant(code, "INSTALL_SHA256")
    version_parts(version)
    if not SOURCE_RE.fullmatch(source) or not HASH_RE.fullmatch(digest):
        raise HostedInstallError("The installer does not contain a valid immutable widget pin.")
    return version, source, digest


def verify_distribution(installer, widget, fetcher=fetch_public):
    version, source, digest = installer_metadata(installer)
    if hashlib.sha256(widget).hexdigest() != digest or script_version(widget) != version:
        raise HostedInstallError("The reviewed widget and installer metadata disagree.")
    hosted_installer = fetcher(INSTALLER_URL, INSTALLER_LIMIT)
    if hosted_installer != installer:
        raise HostedInstallError("The hosted installer does not match the reviewed installer bytes.")
    if installer_metadata(hosted_installer) != (version, source, digest):
        raise HostedInstallError("The hosted installer release metadata does not match.")
    hosted_widget = fetcher(source, WIDGET_LIMIT)
    if hosted_widget != widget or hashlib.sha256(hosted_widget).hexdigest() != digest:
        raise HostedInstallError("The hosted widget does not match the reviewed widget bytes and SHA-256.")
    if script_version(hosted_widget) != version:
        raise HostedInstallError("The hosted widget version does not match the installer.")
    return version, digest


def check_hosted(root, fetcher=fetch_public):
    # Establish the local code commit, manifest, header, version and website pin
    # before trusting any metadata obtained over the network.
    prepare_release(root, check=True)
    return verify_distribution((root / "docs/installer.js").read_bytes(), (root / "FordPassWidgets.js").read_bytes(), fetcher)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    try:
        version, digest = check_hosted(Path(__file__).resolve().parent.parent)
    except (ValueError, OSError) as error:
        parser.exit(1, "Hosted install check failed: " + str(error) + "\n")
    print("Verified public installer and immutable widget v" + version + "; SHA-256 " + digest)


if __name__ == "__main__":
    main()
