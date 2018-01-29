import { select } from 'd3-selection';

import CountriesMap from './CountriesMap';
import './index.scss';

function createOptions(containerNode) {
  const options = {};

  // Collect data- attributes
  const containerDataset = containerNode.dataset;
  for (const key in containerDataset) {
    options[key] = containerDataset[key];
  }

  // Add dimensions
  const width = containerNode.offsetWidth;
  let height = containerNode.offsetHeight;
  if (options.aspect) {
    options.aspect = JSON.parse(options.aspect);
    height = width * (options.aspect[1] / options.aspect[0]);
  }
  options.width = width;
  options.height = height;

  return options;
}

function initializeCountriesMap() {
  const container = select('#ta-countries-map');
  if (!container.empty()) {
    new CountriesMap(container.append('svg').node(), createOptions(container.node()));
  }
}


document.addEventListener('DOMContentLoaded', () => {
  initializeCountriesMap();
});
