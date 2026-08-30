from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, Field, field_validator


def normalized_email(value: str) -> str:
    try:
        return validate_email(
            value.strip(), check_deliverability=False, test_environment=True
        ).normalized
    except EmailNotValidError as error:
        raise ValueError("Enter a valid email address.") from error


class RegisterInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str
    password: str = Field(min_length=8, max_length=72)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return value.strip()

    _normalize_email = field_validator("email")(normalized_email)


class LoginInput(BaseModel):
    email: str
    password: str = Field(min_length=1, max_length=72)

    _normalize_email = field_validator("email")(normalized_email)
