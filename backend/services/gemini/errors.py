"""Provider exceptions shared by all Gemini service modules."""


class ProviderError(Exception):
    """The provider ran but failed (timeout, malformed output, upstream error).

    Never surfaces as a raw 500 — endpoints translate it into a typed
    AppError with a user-readable message.
    """


class ProviderUnavailable(Exception):
    """The provider cannot perform this operation (e.g. no API key for
    image extraction). Callers must degrade honestly, never fabricate.
    """
