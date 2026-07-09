import argparse

from src.collector.dataset_collector import DatasetCollector

parser = argparse.ArgumentParser(description="Collect a benchmark dataset from a GitHub repository.")
parser.add_argument("repository_url")
parser.add_argument("commit_count", type=int)
args = parser.parse_args()

collector = DatasetCollector(
    repository_url=args.repository_url,
    output_directory="./benchmark",
    commit_count=args.commit_count,
)

commit_hashes = collector.collect()
print(f"Saved {len(commit_hashes)} commit(s) to ./benchmark")
