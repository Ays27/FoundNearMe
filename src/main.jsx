import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Repeat2, Plus, Search, Bookmark, MapPin, X, ArrowUpRight } from 'lucide-react';
import './styles.css';

const categories = ['All items', 'Electronics', 'Bags', 'Keys', 'Accessories', 'Pets'];

async function api(path, options) {
  const response = await fetch(path, options);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The server could not complete the request.');
  return result;
}

function App() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ total: 0, thisMonth: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState('All items');
  const [status, setStatus] = useState('All');
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState(() => {
    try { return JSON.parse(localStorage.getItem('loop-saved-listings') || '[]'); } catch { return []; }
  });
  const [dialog, setDialog] = useState(null);
  const [activeItem, setActiveItem] = useState(null);
  const [form, setForm] = useState({ status: 'Lost', name: '', category: 'Electronics', location: '', description: '', imageUrl: '' });

  useEffect(() => {
    Promise.all([api('/api/listings'), api('/api/stats')])
      .then(([listingData, statsData]) => {
        setItems(listingData.listings);
        setStats(statsData);
        setLoadError('');
      })
      .catch(() => setLoadError('Could not connect to the server. Start the Node backend and refresh this page.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(item => (category === 'All items' || item.category === category) && (status === 'All' || item.status === status) && (!q || `${item.name} ${item.category} ${item.location} ${item.description}`.toLowerCase().includes(q)));
  }, [items, category, status, query]);

  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    setLoadError('');
    try {
      const { listing } = await api('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setItems(current => [listing, ...current]);
      setStats(current => ({ total: current.total + 1, thisMonth: current.thisMonth + 1 }));
      setCategory('All items'); setStatus('All'); setQuery(''); setDialog(null);
      setForm({ status: 'Lost', name: '', category: 'Electronics', location: '', description: '', imageUrl: '' });
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const scrollTo = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  const toggleSaved = (event, id) => {
    event.stopPropagation();
    setSaved(current => {
      const next = current.includes(id) ? current.filter(savedId => savedId !== id) : [...current, id];
      localStorage.setItem('loop-saved-listings', JSON.stringify(next));
      return next;
    });
  };

  return <div className="site-shell">
    <header className="site-header">
      <a className="logo" href="#top" aria-label="Loop home"><span className="logo-mark"><Repeat2 size={20} strokeWidth={2.6}/></span><span>loop<span className="logo-period">.</span></span></a>
      <nav><button className="nav-link current" onClick={() => scrollTo('top')}>Browse</button><button className="nav-link" onClick={() => scrollTo('how')}>How it works</button></nav>
      <button className="header-post" onClick={() => setDialog('post')}><Plus size={17}/> Post an item</button>
    </header>

    <main id="top">
      <section className="hero">
        <div className="hero-glow" aria-hidden="true"/>
        <div className="hero-copy">
          <div className="neighbor-stamp">NEIGHBORS HELPING NEIGHBORS</div>
          <h1>Lost something?<br/><em>Let’s find it.</em></h1>
          <p>A community-powered place to reunite people with the things they<br className="desktop-break"/> miss. Search nearby finds or tell your neighbors what to look for.</p>
          <form className="search-box" onSubmit={event => { event.preventDefault(); scrollTo('listings'); }}>
            <Search size={19}/><input aria-label="Search listings" placeholder="What are you looking for?" value={query} onChange={event => setQuery(event.target.value)}/>
            <button type="submit">Search listings</button>
          </form>
          <div className="hero-stats"><span><b>{stats.total}</b> items posted</span><i/><span><b>{stats.thisMonth}</b> posted this month</span></div>
        </div>
      </section>

      <section className="community" id="listings">
        <div className="community-heading"><div><div className="eyebrow">COMMUNITY BOARD</div><h2>Recently posted</h2></div>
          <div className="status-switch" role="group" aria-label="Filter by listing status">{['All', 'Lost', 'Found'].map(value => <button key={value} className={status === value ? 'on' : ''} onClick={() => setStatus(value)}>{value}</button>)}</div>
        </div>
        <div className="category-row">{categories.map(value => <button key={value} className={`category-chip ${category === value ? 'active' : ''}`} onClick={() => setCategory(value)}>{value}</button>)}</div>

        {loadError && <div className="api-message" role="alert">{loadError}</div>}
        {loading ? <div className="empty"><p>Loading listings…</p></div> : filtered.length ? <div className="listing-grid">{filtered.map(item => <article key={item.id} className="listing-card" onClick={() => setActiveItem(item)}>
          <div className="listing-image">{item.imageUrl ? <img src={item.imageUrl} alt={item.name}/> : <div className="listing-photo-placeholder" aria-label="No photo provided"><Repeat2 size={38}/></div>}<span className={`status-tag ${item.status.toLowerCase()}`}>{item.status}</span><button className={`bookmark ${saved.includes(item.id) ? 'bookmarked' : ''}`} aria-label={saved.includes(item.id) ? 'Remove saved item' : 'Save item'} onClick={event => toggleSaved(event, item.id)}><Bookmark size={18} fill={saved.includes(item.id) ? 'currentColor' : 'none'}/></button></div>
          <div className="listing-info"><div className="listing-meta"><span>{item.category}</span><span>{item.age}</span></div><h3>{item.name}</h3><p className="description">{item.description}</p><div className="card-location"><MapPin size={15}/><b>{item.location}</b></div></div>
        </article>)}</div> : <div className="empty"><Search size={24}/><h3>No listings found</h3><p>Try a different search or filter to see what neighbors have posted.</p><button onClick={() => { setQuery(''); setCategory('All items'); setStatus('All'); }}>Clear filters</button></div>}
        <div className="results-count">Showing {filtered.length} of {items.length} listings</div>
      </section>

      <section className="how" id="how"><div className="how-copy"><div className="how-eyebrow">SIMPLE BY DESIGN</div><h2>A little help goes<br/>a long way.</h2><p>Post it under a minute. Loop shares the details while keeping your personal contact info private.</p></div><div className="steps"><article><span>01</span><h3>Post it</h3><p>Add a clear photo and where the item was last seen.</p></article><article><span>02</span><h3>Spread the word</h3><p>Nearby neighbors can search, save, and share the listing.</p></article><article><span>03</span><h3>Make the match</h3><p>Connect safely and arrange a simple return.</p></article></div></section>
    </main>
    <footer><a href="#top" className="footer-logo">loop.</a><span>Built for kinder, more connected neighborhoods.</span><span>© 2025 Loop Community</span></footer>

    {dialog === 'post' && <div className="overlay" onMouseDown={event => event.target === event.currentTarget && setDialog(null)}><section className="dialog" aria-labelledby="post-heading"><button className="dialog-close" onClick={() => setDialog(null)} aria-label="Close"><X size={19}/></button><div className="eyebrow">COMMUNITY BOARD</div><h2 id="post-heading">Post an item</h2><p>Give your neighbors the details they need to help.</p>{loadError && <div className="api-message" role="alert">{loadError}</div>}<form onSubmit={submit}><label>Is it lost or found?<div className="choice-row"><button type="button" className={form.status === 'Lost' ? 'chosen' : ''} onClick={() => setForm({ ...form, status: 'Lost' })}>Lost</button><button type="button" className={form.status === 'Found' ? 'chosen' : ''} onClick={() => setForm({ ...form, status: 'Found' })}>Found</button></div></label><label>Item name<input required maxLength="100" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="e.g. Black canvas backpack"/></label><div className="form-pair"><label>Category<select value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}>{categories.slice(1).map(value => <option key={value}>{value}</option>)}</select></label><label>Location<input required maxLength="120" value={form.location} onChange={event => setForm({ ...form, location: event.target.value })} placeholder="Where was it seen?"/></label></div><label>Details<textarea rows="3" maxLength="1000" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Color, identifying marks, or other helpful details"/></label><label>Photo URL (optional)<input type="url" value={form.imageUrl} onChange={event => setForm({ ...form, imageUrl: event.target.value })} placeholder="https://…"/></label><button className="submit-post" type="submit" disabled={saving}>{saving ? 'Posting…' : 'Post listing'} <ArrowUpRight size={16}/></button><small>A direct link to an image can be added above.</small></form></section></div>}
    {activeItem && <div className="overlay" onMouseDown={event => event.target === event.currentTarget && setActiveItem(null)}><section className="dialog detail-dialog"><button className="dialog-close" onClick={() => setActiveItem(null)} aria-label="Close"><X size={19}/></button>{activeItem.imageUrl ? <img className="detail-photo" src={activeItem.imageUrl} alt={activeItem.name}/> : <div className="detail-photo detail-photo-placeholder"><Repeat2 size={42}/></div>}<span className={`status-tag detail-status ${activeItem.status.toLowerCase()}`}>{activeItem.status}</span><div className="listing-meta"><span>{activeItem.category}</span><span>{activeItem.age}</span></div><h2>{activeItem.name}</h2><p>{activeItem.description}</p><div className="card-location"><MapPin size={15}/><b>{activeItem.location}</b></div><button className="submit-post" onClick={() => setActiveItem(null)}>Close listing details <ArrowUpRight size={16}/></button><small>For a safe return, arrange a public handoff.</small></section></div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
