const BASE_URL = 'https://world.openfoodfacts.org/cgi/search.pl';

const parseMl = (value) => {
  if (!value) return null;
  const match = String(value).toLowerCase().match(/(\d+(?:[\.,]\d+)?)\s*ml/);
  if (!match) return null;
  return Math.round(parseFloat(match[1].replace(',', '.')));
};

const normalizeCaffeine = (product) => {
  const nutriments = product?.nutriments || {};
  const caffeine100g = nutriments.caffeine_100g;
  if (typeof caffeine100g === 'number' && !Number.isNaN(caffeine100g)) {
    return Math.round(caffeine100g);
  }
  const caffeine = nutriments.caffeine;
  if (typeof caffeine === 'number' && !Number.isNaN(caffeine)) {
    return Math.round(caffeine);
  }
  return null;
};

export const searchProducts = async (query) => {
  if (!query?.trim()) return [];

  const url = new URL(BASE_URL);
  url.searchParams.set('search_terms', query.trim());
  url.searchParams.set('search_simple', '1');
  url.searchParams.set('action', 'process');
  url.searchParams.set('json', '1');
  url.searchParams.set('page_size', '10');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error('Fehler beim Abrufen der Daten');
  }

  const data = await response.json();
  const products = Array.isArray(data?.products) ? data.products : [];

  return products.map((product, index) => {
    const quantity = product.quantity || product.serving_size || '';
    const sizeMl = parseMl(quantity) || parseMl(product.serving_size) || parseMl(product.quantity);

    return {
      id: product.id || product._id || product.code || `${index}`,
      name: product.product_name || product.generic_name || 'Unbekanntes Getränk',
      brand: product.brands || '',
      quantity,
      caffeinePer100ml: normalizeCaffeine(product),
      sizeMl,
    };
  });
};
