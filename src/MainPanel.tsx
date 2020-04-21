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
  propKey: string;
  propValue: string;
  currentStep: number;
}

const stepsArray = ['Place Access Point', 'Place Area of Interest', 'Select Feature to enter Property', 'Send to Server'];

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

    this.select = new Select({
      condition: click,
    });
    this.select.setActive(false);
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

    if (prevState.editMode !== this.state.editMode) {
      if (!this.state.editMode) {
        this.addInteractions();
      }
    }

    if (prevState.currentStep !== this.state.currentStep) {
      switch (this.state.currentStep) {
        case 1:
          this.setState({ drawOption: 'Point' }, () => this.addInteractions());
          break;
        case 2:
          if (prevState.currentStep === 1) {
            this.setState({ drawOption: 'Polygon' }, () => this.addInteractions());
          } else {
            this.draw.setActive(true);
            this.snap.setActive(true);
            this.modify.setActive(true);
            this.select.setActive(false);
          }
          break;
        case 3:
          if (prevState.currentStep === 2) {
            this.draw.setActive(false);
            this.snap.setActive(false);
            this.modify.setActive(false);
            this.select.setActive(true);
          }
          break;
        case 4:
          const features = this.drawLayer.getSource().getFeatures();
          const format = new GeoJSON({ featureProjection: 'EPSG:4326' });
          if (features.length > 0) {
            const geoJSON = JSON.parse(format.writeFeatures(features));
            axios
              .post('http://158.177.187.158:5000/upload-json', { data: geoJSON })
              .then(res => console.log(res))
              .catch(err => console.log(err));
          }
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

  onKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.which === 13) {
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
    }
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
    }
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

  handleClick(clickType: string) {
    const { currentStep } = this.state;
    let newStep = currentStep;
    clickType === 'next' ? newStep++ : newStep--;

    if (newStep > 0 && newStep <= 5) {
      this.setState({
        currentStep: newStep,
      });
    }
  }

  render() {
    const { width, height } = this.props;
    const { propKey, propValue, selectedFeature, currentStep } = this.state;

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
          {selectedFeature && (
            <div className="input-fields">
              <input
                type="text"
                className="form__input"
                id="propKey"
                placeholder="Key"
                name="propKey"
                value={propKey}
                onChange={this.handleLabelInput}
              />
              <input
                type="text"
                className="form__input"
                id="propValue"
                placeholder="Value"
                name="propValue"
                value={propValue}
                onChange={this.handleLabelInput}
                onKeyPress={this.onKeyPress}
              />
            </div>
          )}
          <Stepper direction="vertical" currentStepNumber={currentStep - 1} steps={stepsArray} stepColor="#ee5253" />
          <div className="buttons-container">
            <button onClick={() => this.handleClick('')}>Previous</button>
            <button onClick={() => this.handleClick('next')}>Next</button>
          </div>
        </div>
      </div>
    );
  }
}
