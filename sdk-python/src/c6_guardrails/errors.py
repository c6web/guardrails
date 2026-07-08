class GatewayError(Exception):
    def __init__(
        self,
        message: str,
        status: int = 0,
        code: str | None = None,
        request_id: str | None = None,
        hint: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.request_id = request_id
        self.hint = hint


class FirewallBlockError(GatewayError):
    def __init__(
        self,
        message: str,
        code: str | None = None,
        request_id: str | None = None,
        hint: str | None = None,
        blocked_stage: str | None = None,
    ) -> None:
        super().__init__(message, status=403, code=code, request_id=request_id, hint=hint)
        self.blocked_stage = blocked_stage


class RateLimitError(GatewayError):
    def __init__(
        self,
        message: str,
        retry_after: int,
        code: str | None = None,
        request_id: str | None = None,
    ) -> None:
        super().__init__(message, status=429, code=code, request_id=request_id)
        self.retry_after = retry_after


class AuthenticationError(GatewayError):
    def __init__(self, message: str) -> None:
        super().__init__(message, status=401)


class GatewayUnavailableError(GatewayError):
    def __init__(self, message: str, status: int = 502) -> None:
        super().__init__(message, status=status)
