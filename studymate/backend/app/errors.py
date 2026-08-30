from dataclasses import dataclass


@dataclass(slots=True)
class AppError(Exception):
    status_code: int
    code: str
    message: str

    def __post_init__(self) -> None:
        Exception.__init__(self, self.message)
