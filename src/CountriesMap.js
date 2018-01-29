import { geoPath } from 'd3-geo';
import { geoGinzburg5 } from 'd3-geo-projection';
import { json as d3json } from 'd3-request';
import { select } from 'd3-selection';
import * as topojson from 'topojson-client';

export default class CountriesMap {
  constructor(parent, options) {
    this.width = options.width;
    this.height = options.height;
    this.parent = select(parent);

    if (options.aspect) {
      this.parent
        .attr('preserveAspectRatio', 'xMinYMin meet')
        .attr('viewBox', `0 0 ${this.width} ${this.height}`);

      const parentContainer = select(this.parent.node().parentNode);
      parentContainer
        .style('padding-bottom', () => {
          const paddingBottom = parseFloat(parentContainer.style('width'), 10) * (options.aspect[1] / options.aspect[0]) + '%';
          return paddingBottom;
        });
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

    this.countries = this.root.append('g');
    const country = this.countries.selectAll('.country')
      .data(this.countriesGeojson.features)
      .enter()
      .append('g')
      .classed('country', true);

    const fill = (d => {
      console.log(d);
      return 'gray';
    });

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
