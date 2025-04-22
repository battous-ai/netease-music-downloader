export interface Song {
  id: string;
  name: string;
  artists?: Array<{
    name: string;
  }>;
  album?: {
    name: string;
    picUrl?: string;
  };
  duration?: number;
  publishTime?: number;
}

export interface AlbumInfo {
  songs: Song[];
  albumName: string;
  artistName: string;
  picUrl?: string;
  publishTime?: number;
}

export interface TrackInfo {
  id: string;
  name: string;
  picUrl: string;
  artistName: string;
}

export interface PlaylistInfo {
  playlistName: string;
  tracks: TrackInfo[];
}