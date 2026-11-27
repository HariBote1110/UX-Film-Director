declare module 'mp4box' {
  export interface MP4BoxBuffer extends ArrayBuffer {
    fileStart: number;
  }

  export interface ISOFile {
    [key: string]: any;
  }

  export const createFile: (...args: any[]) => ISOFile;
  export const DataStream: any;
}
