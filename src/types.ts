import { DataFrame, Field, Vector } from '@grafana/data';
import { GeoJSONFeatureCollection } from 'ol/format/GeoJSON';

export interface MapOptions {
  center_lat: number;
  center_lon: number;
  zoom_level: number;
  max_zoom: number;
  tile_url: string;
  geoJSON: GeoJSONFeatureCollection | null;
}

export const defaults: MapOptions = {
  center_lat: 48.262725,
  center_lon: 11.66725,
  zoom_level: 18,
  max_zoom: 22,
  tile_url: '',
  geoJSON: null,
};

interface Buffer extends Vector {
  buffer: any;
}

export interface FieldBuffer extends Field<any, Vector> {
  values: Buffer;
}

export interface Frame extends DataFrame {
  fields: FieldBuffer[];
}
