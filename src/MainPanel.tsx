import React, { PureComponent } from 'react';
import { PanelProps } from '@grafana/data';
import { MapOptions } from 'types';
import { Map, View, Feature } from 'ol';
import { Draw, Modify, Snap } from 'ol/interaction';
import GeometryType from 'ol/geom/GeometryType';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import { XYZ, Vector as VectorSource } from 'ol/source';
import { Fill, Stroke, Style, Circle as CircleStyle, Text } from 'ol/style';
import GeoJSON from 'ol/format/GeoJSON';
import { fromLonLat } from 'ol/proj';
import { defaults, DragPan, MouseWheelZoom, Select } from 'ol/interaction';
import { SelectEvent } from 'ol/interaction/Select';
import { platformModifierKeyOnly, click } from 'ol/events/condition';
import { FormField } from '@grafana/ui';
import { nanoid } from 'nanoid';
import axios from 'axios';
// import clientAPI from './utils/API';
import Undo from './img/undo.svg';
import SVG from 'react-inlinesvg';
import Done from './img/done.svg';
import Delete from './img/delete.svg';
// import Stepper from './stepper/Stepper';
import 'ol/ol.css';
import './styles/main.css';
import { FeatureLike } from 'ol/Feature';

interface Props extends PanelProps<MapOptions> {}
interface State {
  drawOption: string;
  editMode: boolean;
  selectedFeature: Feature | null;
  propKey: string;
  propValue: string;
  currentStep: number;
}

// const stepsArray = ['Placing AP & POI', 'Creating Label', 'Send to Server'];

export class MainPanel extends PureComponent<Props, State> {
  id: string;
  map: Map;
  randomTile: TileLayer;
  dropdown: React.RefObject<HTMLSelectElement>;
  drawLayer: VectorLayer;
  geoLayer: VectorLayer;
  draw: Draw;
  modify: Modify;
  snap: Snap;
  select: Select;

  constructor(props: Props) {
    super(props);
    this.id = 'id' + nanoid();
    this.state = {
      drawOption: 'Point',
      editMode: false,
      selectedFeature: null,
      propKey: '',
      propValue: '',
      currentStep: 1,
    };
  }

  componentDidMount() {
    console.log('host', window.location.hostname);
    console.log('process host', process.env.host);
    const { center_lat, center_lon, zoom_level, max_zoom, tile_url } = this.props.options;

    const carto = new TileLayer({
      source: new XYZ({
        url: 'https://{1-4}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      }),
    });

    const source = new VectorSource();
    this.drawLayer = new VectorLayer({
      source: source,
      style: function(feature: FeatureLike) {
        const propKeyFromFeature = Object.keys(feature.getProperties()).find((el: string) => el !== 'geometry');
        const textLabel = propKeyFromFeature ? `${propKeyFromFeature} ${feature.get(propKeyFromFeature)}` : undefined;
        const offsetY = feature.getGeometry().getType() === 'Point' ? -10 : 0;
        return new Style({
          fill: new Fill({
            color: 'rgba(255, 255, 255, 0.2)',
          }),
          stroke: new Stroke({
            color: '#ffcc33',
            width: 2,
          }),
          image: new CircleStyle({
            radius: 7,
            fill: new Fill({
              color: '#ffcc33',
            }),
          }),
          text: new Text({
            stroke: new Stroke({
              color: '#fff',
              width: 2,
            }),
            font: '14px Calibri,sans-serif',
            text: textLabel,
            offsetY: offsetY,
          }),
        });
      },
      /* new Style({
        fill: new Fill({
          color: 'rgba(255, 255, 255, 0.2)',
        }),
        stroke: new Stroke({
          color: '#ffcc33',
          width: 2,
        }),
        image: new CircleStyle({
          radius: 7,
          fill: new Fill({
            color: '#ffcc33',
          }),
        }),
      }), */ zIndex: 2,
    });

    this.map = new Map({
      interactions: defaults({ dragPan: false, mouseWheelZoom: false, onFocusOnly: true }).extend([
        new DragPan({
          condition: function(event) {
            return platformModifierKeyOnly(event) || this.getPointerCount() === 2;
          },
        }),
        new MouseWheelZoom({
          condition: platformModifierKeyOnly,
        }),
      ]),
      layers: [carto, this.drawLayer],
      view: new View({
        center: fromLonLat([center_lon, center_lat]),
        zoom: zoom_level,
        maxZoom: max_zoom,
      }),
      target: this.id,
    });

    if (tile_url !== '') {
      this.randomTile = new TileLayer({
        source: new XYZ({
          url: tile_url,
        }),
        zIndex: 1,
      });
      this.map.addLayer(this.randomTile);
    }

    this.select = new Select({
      condition: click,
    });
    this.select.setActive(false);
    this.map.addInteraction(this.select);

    this.select.on('select', (e: SelectEvent) => {
      const selectedFeature = e.target.getFeatures().item(0);
      if (selectedFeature) {
        // const label = selectedFeature.get('label') || '';
        // this.setState(prevState => ({ ...prevState, selectedFeature, propKey: label }));
        const propKey = selectedFeature.getKeys().find((el: string) => el !== 'geometry');
        if (propKey) {
          const propValue = selectedFeature.get(propKey);

          this.setState(prevState => ({ ...prevState, selectedFeature, propKey, propValue }));
        } else {
          this.setState(prevState => ({ ...prevState, selectedFeature, propKey: '', propValue: '' }));
        }

        /* const format = new GeoJSON({ featureProjection: 'EPSG:4326' });

        selectedFeature && console.log('selecting...', format.writeFeature(selectedFeature)); */
      } else {
        this.setState(prevState => ({ ...prevState, selectedFeature: null, propKey: '', propValue: '' }));
      }
    });

    this.modify = new Modify({ source: source });
    this.map.addInteraction(this.modify);

    this.addInteractions();
    /*     modify = new Modify({ source: source });
    this.map.addInteraction(modify);

    draw = new Draw({
      source: source,
      type: GeometryType.POLYGON,
    });
    this.map.addInteraction(draw);
    snap = new Snap({ source: source });
    this.map.addInteraction(snap); */

    /*     draw.on('drawend', e => {
      console.log('draw end');
      const geom = e.feature.getGeometry();
      const format = new GeoJSON({ });
      const feature = new Feature({
        geometry: geom,
      });
      const obj = format.writeFeature(feature);
      console.log(obj);
    });

    modify.on('modifyend', e => {
      console.log('modify end');
      console.log(e.features.item(0).getGeometry());
    }); */
  }

  componentDidUpdate(prevProps: Props, prevState: State) {
    if (prevProps.options.tile_url !== this.props.options.tile_url) {
      if (this.randomTile) {
        this.map.removeLayer(this.randomTile);
      }

      if (this.props.options.tile_url !== '') {
        this.randomTile = new TileLayer({
          source: new XYZ({
            url: this.props.options.tile_url,
          }),
          zIndex: 1,
        });
        this.map.addLayer(this.randomTile);
      }
    }

    if (prevProps.options.zoom_level !== this.props.options.zoom_level) {
      this.map.getView().setZoom(this.props.options.zoom_level);
    }

    if (prevProps.options.center_lat !== this.props.options.center_lat || prevProps.options.center_lon !== this.props.options.center_lon) {
      this.map.getView().animate({
        center: fromLonLat([this.props.options.center_lon, this.props.options.center_lat]),
        duration: 2000,
      });
    }

    if (prevState.editMode !== this.state.editMode) {
      if (!this.state.editMode) {
        this.addInteractions();
      }
    }

    /*     if (prevState.editMode !== this.state.editMode) {
      if (!this.state.editMode && this.props.options.geoJSON) {
        const vectorSource = new VectorSource({
          features: new GeoJSON().readFeatures(this.props.options.geoJSON as object),
        });
        this.geoLayer = new VectorLayer({
          source: vectorSource,
          style: new Style({
            fill: new Fill({
              color: 'rgba(255, 255, 255, 0.2)',
            }),
            stroke: new Stroke({
              color: '#ffcc33',
              width: 2,
            }),
            image: new CircleStyle({
              radius: 7,
              fill: new Fill({
                color: '#ffcc33',
              }),
            }),
          }),
          zIndex: 2,
        });

        this.map.addLayer(this.geoLayer);
      }
    } */
  }

  handleUndo = () => {
    const lastFeature = this.drawLayer
      .getSource()
      .getFeatures()
      .pop();
    lastFeature && this.drawLayer.getSource().removeFeature(lastFeature);
  };

  handleSave = () => {
    const features = this.drawLayer.getSource().getFeatures();
    const format = new GeoJSON({ featureProjection: 'EPSG:4326' });
    if (features.length > 0) {
      const geoJSON = JSON.parse(format.writeFeatures(features));
      axios
        .post('http://158.177.187.158:5000/upload-json', { data: geoJSON })
        .then(res => console.log(res))
        .catch(err => console.log(err));

      /*       clientAPI
        .post('/upload-json', { geoJSON: geoJSON })
        .then(res => console.log(res))
        .catch(err => console.log(err)); */
      // this.props.onOptionsChange({ ...this.props.options, geoJSON });
    }
  };

  handleDelete = () => {
    if (this.state.selectedFeature) {
      this.drawLayer.getSource().removeFeature(this.state.selectedFeature);
      this.setState(prevState => ({ ...prevState, selectedFeature: null, propKey: '' }));
    }
  };

  handleDropDown = (e: React.ChangeEvent<HTMLSelectElement>) => {
    this.setState({ drawOption: e.target.value }, () => this.addInteractions());
  };

  handleLabelInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    this.setState(prevState => ({ ...prevState, [name]: value }));
  };

  handleLabelSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const { selectedFeature, propKey, propValue } = this.state;
    if (selectedFeature && propKey) {
      const propKeyFromFeature = selectedFeature.getKeys().find((el: string) => el !== 'geometry');
      if (propKeyFromFeature) {
        selectedFeature.unset(propKeyFromFeature);
        selectedFeature.set(propKey, propValue);
      } else {
        selectedFeature.set(propKey, propValue);
      }

      selectedFeature.setStyle(
        new Style({
          fill: new Fill({
            color: 'rgba(255, 255, 255, 0.2)',
          }),
          stroke: new Stroke({
            color: '#ffcc33',
            width: 2,
          }),
          image: new CircleStyle({
            radius: 7,
            fill: new Fill({
              color: '#ffcc33',
            }),
          }),
          text: new Text({
            stroke: new Stroke({
              color: '#fff',
              width: 2,
            }),
            font: '14px Calibri,sans-serif',
            text: `${propKey} ${propValue}`,
            offsetY: -10,
          }),
        })
      );
    }

    // selectedFeature && selectedFeature.set('label', propKey);
  };

  handleSwitchMode = () => {
    if (this.state.editMode) {
      this.draw.setActive(true);
      this.snap.setActive(true);
      this.modify.setActive(true);
      this.select.setActive(false);
    } else {
      this.draw.setActive(false);
      this.snap.setActive(false);
      this.modify.setActive(false);
      this.select.setActive(true);
    }
    this.setState({ editMode: !this.state.editMode });
  };

  addInteractions = () => {
    this.map.removeInteraction(this.draw);
    this.map.removeInteraction(this.snap);

    const sourceDrawLayer = this.drawLayer.getSource();
    const { drawOption } = this.state;

    this.draw = new Draw({
      source: sourceDrawLayer,
      type: drawOption as GeometryType,
    });
    this.map.addInteraction(this.draw);

    this.snap = new Snap({ source: sourceDrawLayer });
    this.map.addInteraction(this.snap);
  };

  render() {
    const { width, height } = this.props;
    const { drawOption, editMode, propKey, propValue, selectedFeature /* , currentStep */ } = this.state;

    return (
      <div
        style={{
          width,
          height,
        }}
      >
        <div className="flex-row space-between">
          {!editMode ? (
            <div className="flex-row">
              <select onChange={this.handleDropDown} value={drawOption}>
                <option value="Point">Access Point Location</option>
                <option value="Polygon">Polygon of Interest</option>
              </select>
              <SVG src={Undo} onClick={this.handleUndo} className="img-button" />
            </div>
          ) : (
            <div className="flex-row">
              <SVG src={Done} onClick={this.handleSave} className="img-button" />
              {selectedFeature && (
                <>
                  <SVG src={Delete} onClick={this.handleDelete} className="img-button" />

                  <form onSubmit={this.handleLabelSubmit}>
                    {/* <input className="label-input" onChange={this.handleLabelInput} value={propKey} /> */}
                    <div className="flex-row">
                      <FormField
                        label="Key"
                        labelWidth={3}
                        inputWidth={5}
                        type="text"
                        name="propKey"
                        value={propKey}
                        onChange={this.handleLabelInput}
                      />
                      <FormField
                        label="Value"
                        labelWidth={4}
                        inputWidth={5}
                        type="text"
                        name="propValue"
                        value={propValue}
                        onChange={this.handleLabelInput}
                      />
                      {propKey && (
                        <button className="img-button" type="submit">
                          Save
                        </button>
                      )}
                    </div>
                  </form>
                </>
              )}
            </div>
          )}
          <div className="flex-row">
            <section className="text-mode">{editMode ? <p>Setting Labels</p> : <p>Placing AP and POI</p>}</section>
            <div className="gf-form-switch" style={{ border: '1px solid #d9d9d9', borderRadius: '1px' }} onClick={this.handleSwitchMode}>
              <input type="checkbox" checked={editMode} />
              <span className="gf-form-switch__slider"></span>
            </div>
          </div>
        </div>
        <div
          id={this.id}
          style={{
            width,
            height: height - 40,
          }}
          // className="grid-area-wrapper"
        >
          {/* <div id={this.id} className="inner-area"></div>
          <div style={{ display: 'flex' }}>
            <div className="stepper-container-vertical ">
              <Stepper direction="vertical" currentStepNumber={currentStep - 1} steps={stepsArray} stepColor="#ee5253" />
            </div>
          </div> */}
        </div>
      </div>
    );
  }
}
