export interface Song {
  id: string;
  name: string;
  artists?: Array<{
    name: string;
  }>;
}

export interface AlbumInfo {
  songs: Song[];
  albumName: string;
  artistName: string;
}
