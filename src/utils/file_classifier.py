import re
from pathlib import Path

from src.utils.language_detector import EXTENSION_LANGUAGES

BINARY_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".bmp", ".webp",
    ".pdf", ".zip", ".tar", ".gz", ".7z", ".rar",
    ".exe", ".dll", ".so", ".dylib", ".pyc", ".whl", ".jar", ".class",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".mp3", ".mp4", ".mov", ".avi",
    ".xlsx", ".xls", ".docx", ".doc", ".pptx", ".ppt",
}

CI_PATH_PREFIXES = (".github/workflows/", ".circleci/")
CI_ROOT_FILES = {
    "jenkinsfile", ".gitlab-ci.yml", ".travis.yml", "azure-pipelines.yml",
    "appspec.yml", "buildspec.yaml", "buildspec.yml",
}

INFRASTRUCTURE_ROOT_FILES = {"dockerfile", "docker-compose.yml", "docker-compose.yaml"}
INFRASTRUCTURE_EXTENSIONS = {".tf"}

DEPENDENCY_ROOT_FILES = {
    "pyproject.toml", "package.json", "go.mod", "cargo.toml",
    "requirements.txt", "pipfile", "pipfile.lock",
    "poetry.lock", "pdm.lock", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
}

TEST_DIR_NAMES = {"test", "tests", "spec", "specs"}
TEST_NAME_PATTERN = re.compile(r"(^|[_.])tests?([_.]|$)|\.spec\.", re.IGNORECASE)

DOCUMENTATION_DIR_NAMES = {"doc", "docs", "documentation"}
DOCUMENTATION_EXTENSIONS = {".md", ".rst"}
DOCUMENTATION_ROOT_FILES = {
    "readme.md", "readme.rst", "readme.txt", "readme",
    "contributing.md", "contributing.rst", "contributing", "changelog.md",
}

BUILD_ROOT_FILES = {
    "makefile", "setup.py", "setup.cfg",
    "build.gradle", "build.gradle.kts", "cmakelists.txt",
}
BUILD_NAME_PREFIXES = ("webpack.config.", "vite.config.", "rollup.config.")

CONFIGURATION_EXTENSIONS = {".yml", ".yaml", ".toml", ".ini", ".cfg", ".conf", ".json"}
CONFIGURATION_ROOT_FILES = {
    ".editorconfig", ".flake8", ".pylintrc", ".eslintrc", "tox.ini", "pytest.ini", "mypy.ini",
    ".gitignore", ".gitattributes", ".dockerignore",
}

SOURCE_EXTENSIONS = set(EXTENSION_LANGUAGES.keys())


def _file_name(file_path):
    return file_path.rsplit("/", 1)[-1].lower()


def _top_level_dir(file_path):
    return file_path.split("/", 1)[0].lower() if "/" in file_path else None


def is_build_file(file_path):
    name = _file_name(file_path)
    return name in BUILD_ROOT_FILES or name.startswith(BUILD_NAME_PREFIXES)


def classify_file(file_path):
    extension = Path(file_path).suffix.lower()
    name = _file_name(file_path)
    top_dir = _top_level_dir(file_path)

    if extension in BINARY_EXTENSIONS:
        return "Binary"

    if any(file_path.startswith(prefix) for prefix in CI_PATH_PREFIXES) or name in CI_ROOT_FILES:
        return "CI/CD"

    if name in INFRASTRUCTURE_ROOT_FILES or extension in INFRASTRUCTURE_EXTENSIONS:
        return "Infrastructure"

    if name in DEPENDENCY_ROOT_FILES:
        return "Dependency"

    if (top_dir in TEST_DIR_NAMES) or TEST_NAME_PATTERN.search(name):
        return "Test"

    if (top_dir in DOCUMENTATION_DIR_NAMES) or extension in DOCUMENTATION_EXTENSIONS or name in DOCUMENTATION_ROOT_FILES:
        return "Documentation"

    if is_build_file(file_path) or name in CONFIGURATION_ROOT_FILES or extension in CONFIGURATION_EXTENSIONS:
        return "Configuration"

    if extension in SOURCE_EXTENSIONS:
        return "Source"

    return "Unknown"
