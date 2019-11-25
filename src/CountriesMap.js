import { max }  from 'd3-array';
import { geoPath } from 'd3-geo';
import { geoGinzburg5 } from 'd3-geo-projection';
import { json as d3json } from 'd3-request';
import { line } from 'd3-shape';
import { event as currentEvent, select } from 'd3-selection';
import tip from 'd3-tip';
import { zoom } from 'd3-zoom';
import * as topojson from 'topojson-client';
import area from '@turf/area';
import buffer from '@turf/buffer';
import bbox from '@turf/bbox';
import bboxPolygon from '@turf/bbox-polygon';
import { featureCollection, point } from '@turf/helpers';
import { flattenEach } from '@turf/meta';
import nearestPointOnLine from '@turf/nearest-point-on-line';

export default class CountriesMap {
  constructor(parent, options) {
    this.width = options.width;
    this.height = options.height;
    this.parent = select(parent);
    this.parentContainer = select(this.parent.node().parentNode);
    this.allowInteractivity = !options.disableInteractivity;
    this.initialCountry = options.iso;

    if (options.aspect) {
      this.parent
        .attr('preserveAspectRatio', 'xMinYMin meet')
        .attr('viewBox', `0 0 ${this.width} ${this.height}`);
    }
    else {
      this.parent
        .attr('height', this.height)
        .attr('width', this.width);
    }

    this.defaultColor = '#F5F3F2';
    this.hoverColor = '#00A792';

    this.parentContainer.node().addEventListener('search:countrySelect', e => {
      const match = this.getMatchingCountry(e.detail.isocode);
      this.selectCountry(match);
      if (e.detail.zoomTo && !match.empty()) {
        this.zoomToFeature(match.data()[0]);
      }
    });

    this.baseDataUrl = options.baseDataUrl || '/';
    if (this.baseDataUrl.charAt(this.baseDataUrl.length - 1) !== '/') {
      this.baseDataUrl += '/';
    }

    this.countriesTopojsonUrl = options.countriesTopojsonUrl;

    this.dataOverrideUrl = options.dataOverrideUrl;

    this.projection = geoGinzburg5();
    this.path = geoPath()
      .projection(this.projection);
    this.root = this.parent.append('g');

    this.loadData();

    this.tip = tip().attr('class', 'ta-countriesmap-tooltip');
    this.parent.call(this.tip);

    if (!options.disableScrollZoom) {
      this.parent.call(
        zoom()
          .scaleExtent([1 / 2, 4])
          .on('zoom', this.handleZoom.bind(this))
      );
    }
  }

  getMatchingCountry(isocode) {
    const match = this.countries.selectAll('.country path')
      .filter(d => {
        if (d.properties.ISO_A2 && isocode === d.properties.ISO_A2) return true;
        return isocode === d.properties.ISO_A3;
      });
    return match;
  }

  handleZoom() {
    const transform = currentEvent.transform;
    if (transform.k < 3) {
      this.hideDisputedLines();
    } else {
      this.renderDisputedLines();
    }

    this.root.attr('transform', `translate(${transform.x}, ${transform.y}) scale(${transform.k})`);
  }

  loadCountries() {
    let countriesTopojsonUrl = this.countriesTopojsonUrl;
    if (!countriesTopojsonUrl) {
      countriesTopojsonUrl = this.baseDataUrl + 'countries-simplified.topojson';
    }
    return new Promise((resolve) => {
      d3json(countriesTopojsonUrl, (data) => {
        resolve(topojson.feature(data, data.objects['-']));
      });
    });
  }

  loadDisputedLines() {
    const url = `${this.baseDataUrl}disputed-lines.geojson`;
    return new Promise((resolve) => {
      d3json(url, (data) => resolve(data));
    });
  }

  loadData() {
    return Promise.all([this.loadCountries(), this.loadDisputedLines()])
      .then(([countries, disputedLines]) => {
        this.countriesGeojson = countries;
        this.disputedLinesGeojson = disputedLines;
        this.render();
      });
  }

  selectCountry(matchingCountry) {
    this.countries.selectAll('.country path')
      .style('fill', this.defaultColor);

    matchingCountry
      .style('fill', this.hoverColor);
  }

  renderPaths() {
    const smallCountryThreshold = 20000;

    if (!this.countries) {
      this.countries = this.root.append('g').classed('countries', true);
    }
    const country = this.countries.selectAll('.country')
      .data(this.countriesGeojson.features)
      .enter()
      .append('g')
      .classed('country', true);

    if (this.allowInteractivity) {
      country
        .on('mouseover', (d, i, nodes) => {
          const overPath = select(nodes[i]).select('path');

          this.countries.selectAll('.country path')
            .style('fill', this.defaultColor);
          overPath
            .style('fill', this.hoverColor);

          this.tip.html(d.properties.NAME);
          this.tip.show();

          const mouseoverEvent = new CustomEvent('map:countryHover', { detail: { isocode: d.properties.ISO_A2 } });
          this.parentContainer.node().dispatchEvent(mouseoverEvent);
        })
        .on('mouseout', (d, i, nodes) => {
          select(nodes[i]).select('path')
            .style('fill', this.defaultColor);
          this.tip.hide();

          const mouseoverEvent = new CustomEvent('map:countryHover', { detail: { isocode: null } });
          this.parentContainer.node().dispatchEvent(mouseoverEvent);
        })
        .on('click', d => {
          const clickEvent = new CustomEvent('map:countryClick', { detail: { isocode: d.properties.ISO_A2 } });
          this.parentContainer.node().dispatchEvent(clickEvent);
        });
    }

    const fill = ((d) => {
      if (this.initialCountry) {
        if (
          (d.properties.ISO_A2 && this.initialCountry === d.properties.ISO_A2) ||
          this.initialCountry === d.properties.ISO_A3
        ) {
          return this.hoverColor;
        }
      }
      return this.defaultColor;
    });

    country.append('path')
      .style('fill', fill)
      .attr('d', d => this.path(d));

    this.smallCountries = country.filter(d => d.properties.areakm < smallCountryThreshold && d.properties.TA6_COUNTRY);
    this.smallCountries.append('circle')
      .style('fill', fill)
      .attr('r', 7)
      .attr('cx', d => this.path.centroid(d)[0])
      .attr('cy', d => this.path.centroid(d)[1]);

    return country;
  }

  hideDisputedLines() {
    if (this.disputedLines) {
      this.disputedLines.remove();
      this.disputedLines = null;
    }
  }

  renderDisputedLines() {
    if (this.disputedLines) return;
    this.disputedLines = this.root.append('g').classed('disputed-lines', true);

    const updatedFeatures = this.disputedLinesGeojson.features.map(d => {
      const centroid = this.path.centroid(d);

      const labelPosition = [...centroid];
      let labelRelativePosition;
      if (d.properties.label === 'Indian Line') {
        labelPosition[1] -= 10;
        labelRelativePosition = 'top';
      }
      if (d.properties.label === 'Chinese Line') {
        labelPosition[1] += 10;
        labelRelativePosition = 'bottom';
      }

      return Object.assign({}, d, {
        properties: Object.assign({}, d.properties, {
          centroid,
          labelPosition,
          labelRelativePosition
        })
      });
    });

    const disputedLine = this.disputedLines.selectAll('.disputed-lines')
      .data(updatedFeatures)
      .enter()
      .append('g')
      .classed('disputed-line', true);

    disputedLine.append('path')
      .style('stroke', '#888')
      .style('stroke-width', '0.25px')
      .style('fill', 'none')
      .attr('d', d => this.path(d));

    disputedLine.append('text')
      .text(d => d.properties.label)
      .attr('transform', d => {
        return `translate(${d.properties.labelPosition[0]}, ${d.properties.labelPosition[1]})`;
      })
      .style('font-size', '5px');

    disputedLine.append('path')
      .style('stroke', '#444')
      .style('stroke-width', '0.25px')
      .attr('d', (d, i) => {
        const text = select(disputedLine.nodes()[i]).select('text').node();
        const bbox = text.getBBox();
        let labelSide = [...d.properties.labelPosition];
        labelSide[0] += bbox.width / 2;
        if (d.properties.labelRelativePosition === 'top') {
          labelSide[1] += 2;
        }
        if (d.properties.labelRelativePosition === 'bottom') {
          labelSide[1] -= bbox.height;
        }

        const nearestPointToCentroid = nearestPointOnLine(d, point(this.projection.invert(d.properties.centroid)));

        return line()([
          labelSide,
          this.projection(nearestPointToCentroid.geometry.coordinates)
        ]);
      });
  }

  hideSmallCountryCircles() {
    this.smallCountries.select('circle')
      .style('display', 'none');
  }

  /*
   * Get the larger parts of feature--the ones we definitely want to see when
   * we zoom.
   */
  getBigPartsOfFeature(feature) {
    const parts = [];
    flattenEach(feature, f => {
      f.properties = { area: area(f) };
      parts.push(f);
    });

    const maxArea = max(parts, d => d.properties.area);
    const bigParts = parts.filter(part => part.properties.area >= maxArea / 10);
    return featureCollection(bigParts);
  }

  /*
   * Buffer the feature to make it larger, ensuring that it's a significant size
   * before zooming to it. This is a little awkward but is one way to
   * consistently zoom to the same scale across different scale methods.
   */
  bufferFeature(feature) {
    let bboxFeature = bboxPolygon(bbox(feature));
    const targetArea = 55000000000;
    while (area(bboxFeature) <= targetArea) {
      feature = buffer(feature, 25);
      bboxFeature = bboxPolygon(bbox(feature));
    }
    return feature;
  }

  zoomToFeature(feature) {
    feature = this.bufferFeature(this.getBigPartsOfFeature(feature));
    var bounds = this.path.bounds(feature),
      dx = bounds[1][0] - bounds[0][0],
      dy = bounds[1][1] - bounds[0][1],
      x = (bounds[0][0] + bounds[1][0]) / 2,
      y = (bounds[0][1] + bounds[1][1]) / 2,
      scale = Math.min(0.9, .9 / Math.max(dx / this.width, dy / this.height)),
      translate = [this.width / 4 - scale * x, this.height / 2 - scale * y];

    if (scale > 1) {
      this.hideSmallCountryCircles();
    }

    this.countries.transition()
      .duration(750)
      .attr('transform', `translate(${translate})scale(${scale})`);
  }

  render() {
    const parentRect = this.parent.node().getBoundingClientRect();
    let zoomFeatures = this.countriesGeojson;
    let extent = [[0, 0], [parentRect.width, parentRect.height]];
    let match;

    if (this.initialCountry) {
      match = this.countriesGeojson.features.filter(d => {
        if (d.properties.ISO_A2 && this.initialCountry === d.properties.ISO_A2) return true;
        return this.initialCountry === d.properties.ISO_A3;
      })[0];
      if (match) {
        zoomFeatures = this.getBigPartsOfFeature(match);
        zoomFeatures = this.bufferFeature(zoomFeatures);
        extent = [[0, 0], [parentRect.width / 2, parentRect.height]];
      }
    }

    this.projection.fitExtent(extent, zoomFeatures);
    this.renderPaths();

    if (match) {
      this.hideSmallCountryCircles();
    }
  }
}
