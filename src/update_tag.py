import argparse
import json
from mutagen.mp4 import MP4, MP4Cover
import requests
import os
import functools

# Copied from https://github.com/glomatico/gamdl/blob/main/gamdl/downloader.py#L470
# Copied from https://github.com/LeonNOV/NetCloudCover/blob/master/api.py


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", type=str, required=True)
    return parser.parse_args()


def get_songs(song_ids: str):
    url_str = "https://music.163.com/api/v3/song/detail"
    form = "["
    for song_id in song_ids:
        form = form + f'{{"id": {song_id}}},'

    form = form[:-1] + "]"

    # 获取所有歌单封面img
    json_data = requests.post(url=url_str, data={"c": form})
    return json_data.json()["songs"]

@functools.lru_cache()
def get_url_response_bytes(url: str) -> bytes:
    response = requests.get(url)
    if response.status_code == 200:
        return response.content
    elif response.status_code == 404:
        return None
    else:
        raise Exception(f"Failed to get url {url}")


def update_tag(file_path, song_metadata):
    cover_image = song_metadata["al"]["picUrl"]
    if cover_image:
        cover_bytes = get_url_response_bytes(song_metadata["al"]["picUrl"])

    lrc_path = f"{file_path[:-4]}.lrc"
    if os.path.exists(lrc_path):
        with open(lrc_path, "r", encoding="utf-8") as f:
            lyrics = f.read()
    else:
        lyrics = None

    mp4_tags = {}
    mp4_tags["\xa9nam"] = song_metadata["name"]
    mp4_tags["\xa9ART"] = song_metadata["ar"][0]["name"]
    if lyrics is not None:
        mp4_tags["\xa9lyr"] = [lyrics]
    if cover_bytes is not None:
        mp4_tags["covr"] = [
            MP4Cover(
                cover_bytes,
                imageformat=(
                    MP4Cover.FORMAT_JPEG
                ),
            )
        ]

    mp4 = MP4(file_path)
    mp4.clear()
    mp4.update(mp4_tags)
    mp4.save()

    print('after:', mp4.pprint(), end='\n\n')

def main():
    args = parse_args()

    with open(args.file, "r") as f:
        song_ids = list(json.load(f)["songIds"])

    songs = get_songs(song_ids)
    songs_dict = {}
    for song in songs:
        songs_dict[song["name"]] = song

    dir_path = os.path.dirname(args.file)
    for file in os.listdir(dir_path):
        if file.endswith(".m4a"):
            parts = file[:-4].split("-")
            song_name = parts[-1].strip()
            file_path = os.path.join(dir_path, file)
            print(f"processing {file}, song_name: {song_name}")
            if song_name not in songs_dict:
                print(f"song_name {song_name} not found in metadata_dict")
                continue
            update_tag(file_path, songs_dict[song_name])
    print("done")


if __name__ == "__main__":
    main()