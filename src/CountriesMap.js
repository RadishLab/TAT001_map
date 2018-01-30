import { geoPath } from 'd3-geo';
import { geoGinzburg5 } from 'd3-geo-projection';
import { json as d3json } from 'd3-request';
import { select } from 'd3-selection';
import tip from 'd3-tip';
import * as topojson from 'topojson-client';

export default class CountriesMap {
  constructor(parent, options) {
    this.width = options.width;
    this.height = options.height;
    this.parent = select(parent);
    this.parentContainer = select(this.parent.node().parentNode);

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

  renderPaths() {
    const smallCountryThreshold = 20000;
    const defaultColor = '#F5F3F2';
    const hoverColor = '#00A792';

    this.countries = this.root.append('g');
    const country = this.countries.selectAll('.country')
      .data(this.countriesGeojson.features)
      .enter()
      .append('g')
      .classed('country', true)
      .on('mouseover', (d, i, nodes) => {
        const overPath = select(nodes[i]).select('path');

        overPath
          .style('fill', hoverColor);

        this.tip.html(d.properties.NAME);
        this.tip.show();
      })
      .on('mouseout', (d, i, nodes) => {
        select(nodes[i]).select('path')
          .style('fill', defaultColor);
        this.tip.hide();
      });

    const fill = (() => defaultColor);

    let largeCountries = country.filter(d => d.properties.areakm >= smallCountryThreshold);
    if (largeCountries.empty()) {
      largeCountries = country;
    }
    largeCountries.append('path')
      .style('fill', fill)
      .attr('d', d => this.path(d));

    const smallCountries = country.filter(d => d.properties.areakm < smallCountryThreshold);
    smallCountries.append('circle')
      .style('fill', fill)
      .attr('r', 1)
      .attr('cx', d => this.path.centroid(d)[0])
      .attr('cy', d => this.path.centroid(d)[1]);

    return country;
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
