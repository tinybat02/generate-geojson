import React, { PureComponent } from 'react';
import { PanelProps } from '@grafana/data';
import { MapOptions } from 'types';
import { Map, View, Feature } from 'ol';
import { Draw, Modify, Snap } from 'ol/interaction';
import GeometryType from 'ol/geom/GeometryType';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import { XYZ, Vector as VectorSource } from 'ol/source';
import { FeatureLike } from 'ol/Feature';
import { Fill, Stroke, Style, Circle as CircleStyle, Text } from 'ol/style';
import GeoJSON from 'ol/format/GeoJSON';
import { fromLonLat } from 'ol/proj';
import { defaults, DragPan, MouseWheelZoom, Select } from 'ol/interaction';
import { SelectEvent } from 'ol/interaction/Select';
import { platformModifierKeyOnly, click } from 'ol/events/condition';
import { nanoid } from 'nanoid';
import axios from 'axios';
import Stepper from './stepper/Stepper';
import 'ol/ol.css';
import './styles/main.css';

interface Props extends PanelProps<MapOptions> {}
interface State {
  drawOption: string;
  editMode: boolean;
  selectedFeature: Feature | null;
  propValue: string;
  currentStep: number;
  errorType: string;
  errorMessage: string;
}

const stepsArray = ['Place Access Point', 'Select Point to Enter ID', 'Place Area of Interest', 'Select polygon to Enter Name', 'Send to Server'];

export class MainPanel extends PureComponent<Props, State> {
  id: string;
  map: Map;
  randomTile: TileLayer;
  dropdown: React.RefObject<HTMLSelectElement>;
  drawLayer: VectorLayer;
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
      propValue: '',
      currentStep: 1,
      errorType: '',
      errorMessage: '',
    };
  }

  componentDidMount() {
    // console.log('host', `${window.location.protocol}//${window.location.hostname}:5000/upload-json`);
    const { center_lat, center_lon, zoom_level, max_zoom, tile_url, geoJSON } = this.props.options;

    const carto = new TileLayer({
      source: new XYZ({
        url: 'https://{1-4}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      }),
    });

    const source = geoJSON
      ? new VectorSource({
          features: new GeoJSON().readFeatures(this.props.options.geoJSON as object),
        })
      : new VectorSource();
    this.drawLayer = new VectorLayer({
      source: source,
      style: function(feature: FeatureLike) {
        const textLabel = feature.get('id') || feature.get('name');
        const offsetY = feature.getGeometry().getType() === 'Point' ? -12 : 0;
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
      zIndex: 2,
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

    this.modify = new Modify({ source: source });
    this.map.addInteraction(this.modify);
    this.addInteractions();
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

    if (prevState.currentStep !== this.state.currentStep) {
      switch (this.state.currentStep) {
        case 1:
          if (prevState.currentStep == 2) {
            this.select.getFeatures().clear();
            this.setState({ selectedFeature: null, propValue: '' }, () => {
              this.addInteractions();
              this.select.setActive(false);
              this.modify.setActive(true);
            });
          }
          break;
        case 2:
          this.draw.setActive(false);
          this.snap.setActive(false);
          this.modify.setActive(false);
          if (prevState.currentStep == 1) {
            this.addSelectInteraction();
          }
          if (prevState.currentStep == 3) {
            this.select.getFeatures().clear();
            this.setState({ drawOption: 'Point' }, () => {
              this.addSelectInteraction();
            });
          }
          break;
        case 3:
          this.select.setActive(false);
          this.modify.setActive(true);
          this.setState({ drawOption: 'Polygon', selectedFeature: null, propValue: '' }, () => {
            if (prevState.currentStep == 2) {
              this.addInteractions();
            }
            if (prevState.currentStep == 4) {
              this.select.getFeatures().clear();
              this.draw.setActive(true);
              this.snap.setActive(true);
            }
          });
          break;
        case 4:
          if (prevState.currentStep === 3) {
            this.addSelectInteraction();
            this.draw.setActive(false);
            this.snap.setActive(false);
            this.modify.setActive(false);
          }
          if (prevState.currentStep == 5) {
            this.select.setActive(true);
          }
          break;
        case 5:
          this.setState({ selectedFeature: null, propValue: '' });
          this.select.getFeatures().clear();
          this.select.setActive(false);
          break;
        case 6:
          this.setState({ selectedFeature: null, propValue: '' });

          const format = new GeoJSON({ featureProjection: 'EPSG:4326' });

          const pointFeatures = this.drawLayer
            .getSource()
            .getFeatures()
            .filter(feature => feature.getGeometry().getType() == 'Point');
          const polygonFeatures = this.drawLayer
            .getSource()
            .getFeatures()
            .filter(feature => feature.getGeometry().getType() == 'Polygon');

          axios
            .all([
              axios.post(`${window.location.protocol}//${window.location.hostname}:5000/upload-json`, {
                points: format.writeFeaturesObject(pointFeatures),
              }),
              axios.post(`${window.location.protocol}//${window.location.hostname}:5000/upload-json`, {
                polygons: format.writeFeaturesObject(polygonFeatures),
              }),
            ])
            .then(() => {
              this.setState({ errorType: 'success', errorMessage: 'Saving to server successful!' });
              setTimeout(() => {
                this.setState({ errorType: '', errorMessage: '' });
              }, 3000);
            })
            .catch(err => {
              const { currentStep } = this.state;
              this.setState({ errorType: 'error', errorMessage: err.message, currentStep: currentStep - 1 });
              setTimeout(() => {
                this.setState({ errorType: '', errorMessage: '' });
              }, 3000);
            });

          this.props.onOptionsChange({ ...this.props.options, geoJSON: format.writeFeaturesObject(this.drawLayer.getSource().getFeatures()) });
          break;
      }
    }
  }

  handleUndo = () => {
    const lastFeature = this.drawLayer
      .getSource()
      .getFeatures()
      .pop();
    lastFeature && this.drawLayer.getSource().removeFeature(lastFeature);
  };

  handleDelete = () => {
    if (this.state.selectedFeature) {
      this.drawLayer.getSource().removeFeature(this.state.selectedFeature);
      this.setState(prevState => ({ ...prevState, selectedFeature: null, propKey: '' }));
    }
  };

  handleLabelInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    this.setState(prevState => ({ ...prevState, [name]: value }));
  };

  setFeatureProp = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { selectedFeature, propValue, drawOption } = this.state;
    if (selectedFeature && propValue) {
      if (drawOption == 'Point') {
        selectedFeature.get('id') && selectedFeature.unset('id');
        selectedFeature.set('id', propValue);
      }
      if (drawOption == 'Polygon') {
        selectedFeature.get('name') && selectedFeature.unset('name');
        selectedFeature.set('name', propValue);
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
            text: propValue,
            offsetY: -12,
          }),
        })
      );
    }
  };

  addInteractions = () => {
    const { drawOption } = this.state;

    this.map.removeInteraction(this.draw);
    this.map.removeInteraction(this.snap);
    this.map.removeInteraction(this.select);

    const sourceDrawLayer = this.drawLayer.getSource();

    this.draw = new Draw({
      source: sourceDrawLayer,
      type: drawOption as GeometryType,
    });
    this.map.addInteraction(this.draw);

    this.snap = new Snap({ source: sourceDrawLayer });
    this.map.addInteraction(this.snap);
  };

  addSelectInteraction = () => {
    const { drawOption } = this.state;
    this.select = new Select({
      condition: click,
      filter: feature => {
        return feature.getGeometry().getType() == drawOption;
      },
    });
    this.map.addInteraction(this.select);
    this.select.on('select', (e: SelectEvent) => {
      const selectedFeature = e.target.getFeatures().item(0);
      if (selectedFeature) {
        const propKey = selectedFeature.getKeys().find((el: string) => el !== 'geometry');
        if (propKey) {
          const propValue = selectedFeature.get(propKey);

          this.setState(prevState => ({ ...prevState, selectedFeature, propKey, propValue }));
        } else {
          this.setState(prevState => ({ ...prevState, selectedFeature, propKey: '', propValue: '' }));
        }
      } else {
        this.setState(prevState => ({ ...prevState, selectedFeature: null, propKey: '', propValue: '' }));
      }
    });
  };

  handleButtonClick(clickType: string) {
    const { currentStep } = this.state;
    let newStep = currentStep;
    clickType === 'next' ? newStep++ : newStep--;

    if (newStep < 0 || newStep > stepsArray.length + 1) {
      return;
    }

    if (currentStep == 2 && clickType == 'next') {
      if (this.drawLayer.getSource().getFeatures().length == 0) {
        return;
      }

      let completedPoints = true,
        pointExist = false;

      for (const feature of this.drawLayer.getSource().getFeatures()) {
        if (feature.getGeometry().getType() == 'Point' && !feature.get('id')) {
          completedPoints = false;
          break;
        }
        if (feature.getGeometry().getType() == 'Point') {
          pointExist = true;
        }
      }

      if (!completedPoints || !pointExist) {
        this.setState({ errorType: 'warn', errorMessage: 'Please set ID for all points!' });
        setTimeout(() => {
          this.setState({ errorType: '', errorMessage: '' });
        }, 3000);
        return;
      }
    }

    if (currentStep == 4 && clickType == 'next') {
      if (this.drawLayer.getSource().getFeatures().length == 0) {
        return;
      }

      let completedPolygons = true,
        polygonExist = false;

      for (const feature of this.drawLayer.getSource().getFeatures()) {
        if (feature.getGeometry().getType() == 'Polygon' && !feature.get('name')) {
          completedPolygons = false;
          break;
        }
        if (feature.getGeometry().getType() == 'Polygon') {
          polygonExist = true;
        }
      }

      if (!completedPolygons || !polygonExist) {
        this.setState({ errorType: 'warn', errorMessage: 'Please set name for all polygons!' });
        setTimeout(() => {
          this.setState({ errorType: '', errorMessage: '' });
        }, 3000);
        return;
      }
    }

    if (newStep > 0 && newStep <= stepsArray.length + 1) {
      this.setState({
        currentStep: newStep,
      });
    }
  }

  render() {
    const { width, height } = this.props;
    const { propValue, selectedFeature, currentStep, drawOption, errorType, errorMessage } = this.state;

    return (
      <div
        style={{
          width,
          height,
        }}
        className="grid-area-wrapper"
      >
        <div id={this.id} className="inner-area"></div>

        <div className="stepper-container-vertical ">
          <div style={{ textAlign: 'center' }}>
            <span>Draw Tool &nbsp;</span>
            <button onClick={this.handleUndo}>Undo</button>
            <button onClick={this.handleDelete}>Delete</button>
          </div>

          {errorType == 'warn' && <div className={`bar ${errorType}`}>&#9888; {errorMessage}</div>}
          {errorType == 'error' && <div className={`bar ${errorType}`}>&#9747;{errorMessage}</div>}
          {errorType == 'success' && <div className={`bar ${errorType}`}>&#10004; {errorMessage}</div>}

          {selectedFeature && (
            <div className="input-fields">
              <form onSubmit={this.setFeatureProp}>
                <input
                  type="text"
                  className="form__input"
                  id="propKey"
                  placeholder={drawOption == 'Point' ? 'Enter ID of Point' : 'Enter Name of Place'}
                  name="propValue"
                  value={propValue}
                  onChange={this.handleLabelInput}
                />
              </form>
            </div>
          )}

          <Stepper direction="vertical" currentStepNumber={currentStep - 1} steps={stepsArray} stepColor="#ee5253" />

          <div className="buttons-container">
            <button onClick={() => this.handleButtonClick('')} disabled={currentStep == 1}>
              Previous
            </button>
            <button
              className={currentStep >= stepsArray.length ? 'send-button' : ''}
              onClick={() => this.handleButtonClick('next')}
              disabled={currentStep > stepsArray.length}
            >
              {currentStep >= stepsArray.length ? 'Send' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
