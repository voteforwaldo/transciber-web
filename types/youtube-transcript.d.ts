declare module "youtube-transcript" {
  export class YoutubeTranscript {
    static fetchTranscript(
      videoId: string,
    ): Promise<Array<{ text: string; duration: number; offset: number }>>;
  }
}
