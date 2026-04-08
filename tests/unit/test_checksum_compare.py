from tests.harness.checksums import sha256_text


def test_sha256_text_is_deterministic():
    assert sha256_text("contract-freeze") == sha256_text("contract-freeze")
    assert sha256_text("contract-freeze") != sha256_text("contract-freeze-2")
