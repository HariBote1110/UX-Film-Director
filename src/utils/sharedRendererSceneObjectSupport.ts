import type {
  AudioSphereObject,
  AudioVisualizationObject,
  AsanohaPatternObject,
  BarcodeObject,
  CircularArrowObject,
  ColourWheelObject,
  ContourTraceObject,
  DisplacementPolyObject,
  FocusLinesPlusObject,
  GearObject,
  GetColorDotFieldObject,
  GourdObject,
  HistogramObject,
  HologramObject,
  HoundstoothObject,
  HksyCheckerGridObject,
  ImageObject,
  PaperAirplaneObject,
  ParticleObject,
  PieChartObject,
  PlainEffectorLineObject,
  PsdObject,
  ProtractorObject,
  PuzzlePieceObject,
  RandomLineExObject,
  RegionFrameObject,
  ShakingPolygonObject,
  ShatteredSphereObject,
  ShapeObject,
  SimpleTubeObject,
  SphereDotsObject,
  SphericalFieldObject,
  SunburstObject,
  TartanCheckObject,
  TextObject,
  TimelineObject,
  ToneCurveObject,
  TrackBarObject,
  TriangleBracketObject,
  VideoObject,
  YagasuriObject,
} from '../types';

export type SupportedMediaObject = ImageObject | VideoObject | PsdObject;
type SupportedTextObject = TextObject;
type SupportedGeneratedObject = AudioVisualizationObject | AudioSphereObject | ParticleObject | BarcodeObject | PuzzlePieceObject | ColourWheelObject | GourdObject | GearObject | TrackBarObject | PieChartObject | HistogramObject | ToneCurveObject | GetColorDotFieldObject | HksyCheckerGridObject | RegionFrameObject | SimpleTubeObject | SphereDotsObject | SphericalFieldObject | SunburstObject | CircularArrowObject | TriangleBracketObject | TartanCheckObject | HoundstoothObject | YagasuriObject | PaperAirplaneObject | AsanohaPatternObject | FocusLinesPlusObject | RandomLineExObject | ContourTraceObject | DisplacementPolyObject | PlainEffectorLineObject | HologramObject | ProtractorObject | ShakingPolygonObject | ShatteredSphereObject;
export type SupportedSceneObject = SupportedMediaObject | ShapeObject | SupportedGeneratedObject | SupportedTextObject;

export const isSupportedMediaObject = (object: TimelineObject): object is SupportedMediaObject =>
  object.type === 'image' || object.type === 'video' || object.type === 'psd';

export const isSupportedSceneObject = (object: TimelineObject): object is SupportedSceneObject =>
  isSupportedMediaObject(object)
  || object.type === 'shape'
  || object.type === 'text'
  || object.type === 'audio_visualization'
  || object.type === 'audio_sphere'
  || object.type === 'particle'
  || object.type === 'barcode'
  || object.type === 'puzzle_piece'
  || object.type === 'colour_wheel'
  || object.type === 'gourd'
  || object.type === 'gear'
  || object.type === 'track_bar'
  || object.type === 'pie_chart'
  || object.type === 'histogram'
  || object.type === 'tone_curve'
  || object.type === 'getcolor_dot_field'
  || object.type === 'hksy_checker_grid'
  || object.type === 'region_frame'
  || object.type === 'simple_tube'
  || object.type === 'sphere_dots'
  || object.type === 'spherical_field'
  || object.type === 'sunburst'
  || object.type === 'circular_arrow'
  || object.type === 'triangle_bracket'
  || object.type === 'tartan_check'
  || object.type === 'houndstooth'
  || object.type === 'yagasuri'
  || object.type === 'paper_airplane'
  || object.type === 'asanoha_pattern'
  || object.type === 'focus_lines_plus'
  || object.type === 'random_line_ex'
  || object.type === 'contour_trace'
  || object.type === 'displacement_poly'
  || object.type === 'plain_effector_line'
  || object.type === 'hologram'
  || object.type === 'protractor'
  || object.type === 'shaking_polygon'
  || object.type === 'shattered_sphere';
