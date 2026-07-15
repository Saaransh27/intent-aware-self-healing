DOCUMENTATION_MARKERS = {
    "readme.md", "readme.rst", "readme.txt", "readme",
    "contributing.md", "contributing.rst", "contributing",
}
BUILD_MARKERS = {
    "pyproject.toml", "package.json", "go.mod", "cargo.toml", "makefile",
    "requirements.txt", "pipfile", "pipfile.lock",
}
CONTAINERIZATION_MARKERS = {"dockerfile", "docker-compose.yml", "docker-compose.yaml"}
CI_DIRECTORY_PREFIX = ".github/workflows/"


def detect_repository_signals(file_paths):
    signals = {"documentation": [], "build": [], "containerization": [], "ci": []}

    root_files = {file_path for file_path in file_paths if "/" not in file_path}
    for file_path in sorted(root_files):
        lowered = file_path.lower()
        if lowered in DOCUMENTATION_MARKERS:
            signals["documentation"].append(file_path)
        elif lowered in BUILD_MARKERS:
            signals["build"].append(file_path)
        elif lowered in CONTAINERIZATION_MARKERS:
            signals["containerization"].append(file_path)

    if any(file_path.startswith(CI_DIRECTORY_PREFIX) for file_path in file_paths):
        signals["ci"].append(CI_DIRECTORY_PREFIX)

    return {"repository_signals": signals}
