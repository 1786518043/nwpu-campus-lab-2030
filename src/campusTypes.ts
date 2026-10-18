import type {Project} from './game';

export type CampusId = 'changan' | 'youyi';
export type Building = {
  id: string; name: string; kind: string; points: number[][]; holes: number[][][];
  center: number[]; height: number; heightSource: string; source?: string;
  status?: string; modelStyle?: string; levels?: number;
  positionNote?: string; statusNote?: string;
  evidence?: {label:string;url:string;image?:string}[];
  parts?: {points:number[][];holes:number[][][];height:number;role:string}[];
};
export type CampusData = {
  source: string; retrieved: string; osmBuildingCount: number; supplementalBuildingCount: number;
  projection: string; boundary: number[][]; buildings: Building[];
  roads: {id: string; name: string; kind: string; points: number[][]}[];
  waters: {id: string; name: string; points: number[][]; holes: number[][][]}[];
  grounds: {id: string; name?:string; kind: string; points: number[][]; sport?: string; source?:string}[];
};
export type Landmark = {name: string; location: number[]; height?: number; water?: boolean; buildingId?: string};
export type CampusConfig = {
  id: CampusId; name: string; english: string; subtitle: string; data: CampusData;
  projects: Project[]; landmarks: Landmark[]; tours: {name: string; buildingId?: string; id?:string; location?:number[]; span?:number}[];
  osmWay: string; referenceImage: string; previewImage: string; guideImage: string;
  mapDownload: string; sourceDescription: string; supplementDescription: string;
  auditSources?: {label:string;url:string}[];
  shuttleRoadNames: string[]; shuttleRoute?: number[][];
  athleticsIds: string[];
};
