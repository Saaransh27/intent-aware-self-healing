from pathlib import Path

LOCK_FILE_PACKAGE_MANAGERS = {
    "poetry.lock": "Poetry",
    "pdm.lock": "PDM",
    "package-lock.json": "npm",
    "pnpm-lock.yaml": "pnpm",
    "yarn.lock": "yarn",
}

PYPROJECT_MARKERS = {
    "[tool.poetry]": "Poetry",
    "[tool.hatch]": "Hatch",
    "[tool.pdm]": "PDM",
}


def detect_build_system(repo_path, file_paths):
    root_files = {file_path for file_path in file_paths if "/" not in file_path}

    for filename, package_manager in LOCK_FILE_PACKAGE_MANAGERS.items():
        if filename in root_files:
            return {"package_manager": package_manager, "build_system": None}

    if "pyproject.toml" in root_files:
        content = (Path(repo_path) / "pyproject.toml").read_text()
        for marker, package_manager in PYPROJECT_MARKERS.items():
            if marker in content:
                return {"package_manager": package_manager, "build_system": None}

    if root_files & {"requirements.txt", "setup.py", "setup.cfg"}:
        return {"package_manager": "Pip", "build_system": None}

    if "pom.xml" in root_files:
        return {"package_manager": "Maven", "build_system": None}
    if root_files & {"build.gradle", "build.gradle.kts"}:
        return {"package_manager": "Gradle", "build_system": None}

    if "package.json" in root_files:
        return {"package_manager": "npm", "build_system": None}

    return {"package_manager": None, "build_system": None}
