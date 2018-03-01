import { geoPath } from 'd3-geo';
import { geoGinzburg5 } from 'd3-geo-projection';
import { json as d3json } from 'd3-request';
import { event as currentEvent, select } from 'd3-selection';
import tip from 'd3-tip';
import { zoom } from 'd3-zoom';
import * as topojson from 'topojson-client';

export default class CountriesMap {
  constructor(parent, options) {
    this.width = options.width;
    this.height = options.height;
    this.parent = select(parent);
    this.parentContainer = select(this.parent.node().parentNode);
    this.allowInteractivity = !options.disableInteractivity;

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
    this.root.attr('transform', `translate(${transform.x}, ${transform.y}) scale(${transform.k})`);
  }

  loadCountries() {
    return new Promise((resolve) => {
      d3json(this.baseDataUrl + 'countries-simplified.topojson', (data) => {
        resolve(topojson.feature(data, data.objects['-']));
      });
    });
  }

  loadData() {
    return Promise.all([this.loadCountries()])
      .then(([countries]) => {
        this.countriesGeojson = countries;
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

    const fill = (() => this.defaultColor);

    let largeCountries = country.filter(d => d.properties.areakm >= smallCountryThreshold);
    if (largeCountries.empty()) {
      largeCountries = country;
    }
    largeCountries.append('path')
      .style('fill', fill)
      .attr('d', d => this.path(d));

    const smallCountries = country.filter(d => d.properties.areakm < smallCountryThreshold && d.properties.TA6_COUNTRY);
    smallCountries.append('circle')
      .style('fill', fill)
      .attr('r', 7)
      .attr('cx', d => this.path.centroid(d)[0])
      .attr('cy', d => this.path.centroid(d)[1]);

    return country;
  }

  zoomToFeature(feature) {
    var bounds = this.path.bounds(feature),
      dx = bounds[1][0] - bounds[0][0],
      dy = bounds[1][1] - bounds[0][1],
      x = (bounds[0][0] + bounds[1][0]) / 2,
      y = (bounds[0][1] + bounds[1][1]) / 2,
      scale = Math.min(20, .9 / Math.max(dx / this.width, dy / this.height)),
      translate = [this.width / 2 - scale * x, this.height / 2 - scale * y];

    this.countries.transition()
      .duration(750)
      .style('stroke-width', 1.5 / scale + 'px')
      .attr('transform', `translate(${translate})scale(${scale})`);
  }

  render() {
    const parentRect = this.parent.node().getBoundingClientRect();
    this.projection.fitExtent([
      [0, 0],
      [parentRect.width, parentRect.height]
    ], this.countriesGeojson);

    this.renderPaths();
  }
}
