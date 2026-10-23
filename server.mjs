import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.join(root, 'data');
const dataFile = path.join(dataDirectory, 'listings.json');
const port = Number(process.env.PORT || 3001);
const categories = new Set(['Electronics', 'Bags', 'Keys', 'Accessories', 'Pets']);
const statuses = new Set(['Lost', 'Found']);

async function readListings() {
  await mkdir(dataDirectory, { recursive: true });
  try {
    const content = await readFile(dataFile, 'utf8');
    const listings = JSON.parse(content);
    if (!Array.isArray(listings)) throw new Error('Listings data must be an array.');
    return listings;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeFile(dataFile, '[]\n', { flag: 'wx' }).catch(err => {
      if (err.code !== 'EEXIST') throw err;
    });
    return [];
  }
}

let writeQueue = Promise.resolve();
function addListing(fields) {
  const operation = writeQueue.then(async () => {
    const listings = await readListings();
    const listing = { id: randomUUID(), ...fields, createdAt: new Date().toISOString() };
    listings.push(listing);
    await mkdir(dataDirectory, { recursive: true });
    const tempFile = `${dataFile}.${process.pid}.tmp`;
    await writeFile(tempFile, `${JSON.stringify(listings, null, 2)}\n`, 'utf8');
    await rename(tempFile, dataFile);
    return listing;
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

function ageFor(createdAt) {
  const elapsed = Math.max(0, Date.now() - new Date(createdAt).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

function present(listing) {
  return { ...listing, age: ageFor(listing.createdAt) };
}

function json(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

async function bodyJson(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 32_768) {
      const error = new Error('Request body is too large.');
      error.status = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(raw || '{}');
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.status = 400;
    throw error;
  }
}

function validateListing(input) {
  const listing = {
    status: typeof input.status === 'string' ? input.status.trim() : '',
    category: typeof input.category === 'string' ? input.category.trim() : '',
    name: typeof input.name === 'string' ? input.name.trim() : '',
    location: typeof input.location === 'string' ? input.location.trim() : '',
    description: typeof input.description === 'string' ? input.description.trim() : '',
    imageUrl: typeof input.imageUrl === 'string' ? input.imageUrl.trim() : '',
  };
  const errors = {};
  if (!statuses.has(listing.status)) errors.status = 'Choose Lost or Found.';
  if (!categories.has(listing.category)) errors.category = 'Choose a valid category.';
  if (listing.name.length < 2 || listing.name.length > 100) errors.name = 'Item name must be 2 to 100 characters.';
  if (listing.location.length < 2 || listing.location.length > 120) errors.location = 'Location must be 2 to 120 characters.';
  if (listing.description.length > 1000) errors.description = 'Details must be 1000 characters or fewer.';
  if (listing.imageUrl) {
    try {
      const url = new URL(listing.imageUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      errors.imageUrl = 'Photo URL must start with http:// or https://.';
    }
  }
  if (Object.keys(errors).length) {
    const error = new Error('Please correct the listing details.');
    error.status = 400;
    error.details = errors;
    throw error;
  }
  return { ...listing, imageUrl: listing.imageUrl || null };
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return json(response, 200, { status: 'ok' });
    }
    if (request.method === 'GET' && url.pathname === '/api/listings') {
      let listings = await readListings();
      const status = url.searchParams.get('status');
      const category = url.searchParams.get('category');
      const query = (url.searchParams.get('q') || '').trim().toLocaleLowerCase();
      if (status && status !== 'All') listings = listings.filter(item => item.status === status);
      if (category && category !== 'All items') listings = listings.filter(item => item.category === category);
      if (query) listings = listings.filter(item => `${item.name} ${item.category} ${item.location} ${item.description}`.toLocaleLowerCase().includes(query));
      return json(response, 200, { listings: listings.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(present) });
    }
    if (request.method === 'GET' && url.pathname === '/api/stats') {
      const listings = await readListings();
      const now = new Date();
      const thisMonth = listings.filter(item => {
        const date = new Date(item.createdAt);
        return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
      }).length;
      return json(response, 200, { total: listings.length, thisMonth });
    }
    if (request.method === 'POST' && url.pathname === '/api/listings') {
      const fields = validateListing(await bodyJson(request));
      const listing = await addListing(fields);
      return json(response, 201, { listing: present(listing) });
    }
    if (request.method === 'GET' && url.pathname.startsWith('/api/listings/')) {
      const id = decodeURIComponent(url.pathname.slice('/api/listings/'.length));
      const listing = (await readListings()).find(item => item.id === id);
      return listing ? json(response, 200, { listing: present(listing) }) : json(response, 404, { error: 'Listing not found.' });
    }
    return json(response, 404, { error: 'Route not found.' });
  } catch (error) {
    console.error(error);
    return json(response, error.status || 500, {
      error: error.status ? error.message : 'The server could not complete the request.',
      ...(error.details ? { details: error.details } : {}),
    });
  }
});

server.listen(port, () => console.log(`FoundNearMe API listening on http://localhost:${port}`));
