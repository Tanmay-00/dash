import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://dash-o5vo.onrender.com'
const USER_KEY = 'dash-attendee-id'
const EMAIL_KEY = 'dash-attendee-email'

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`)
  return payload
}

function formatStatus(status = '') {
  return status.toLowerCase().replaceAll('_', ' ')
}

function EventGlyph({ index = 0 }) {
  const glyphs = ['✳', '◈', '✺', '✦', '◌', '✷']
  return <span className={`event-glyph glyph-${index % 6}`} aria-hidden="true">{glyphs[index % glyphs.length]}</span>
}

function App() {
  const [events, setEvents] = useState([])
  const [registrations, setRegistrations] = useState([])
  const [activeTab, setActiveTab] = useState('discover')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [email, setEmail] = useState(() => localStorage.getItem(EMAIL_KEY) || '')
  const [userId, setUserId] = useState(() => localStorage.getItem(USER_KEY) || '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  const loadEvents = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await api('/api/events')
      setEvents(Array.isArray(result) ? result : [])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadRegistrations = useCallback(async (id = userId) => {
    if (!id) {
      setRegistrations([])
      return
    }
    try {
      const result = await api(`/api/me/registrations?user_id=${encodeURIComponent(id)}`)
      setRegistrations(Array.isArray(result) ? result : [])
    } catch {
      setRegistrations([])
    }
  }, [userId])

  useEffect(() => { loadEvents() }, [loadEvents])
  useEffect(() => { loadRegistrations() }, [loadRegistrations])

  const registeredIds = useMemo(() => new Set(registrations.map((item) => item.event_id)), [registrations])
  const visibleEvents = useMemo(() => {
    const list = activeTab === 'tickets' ? events.filter((event) => registeredIds.has(event.id)) : events
    const normalized = query.trim().toLowerCase()
    return normalized ? list.filter((event) => event.title?.toLowerCase().includes(normalized)) : list
  }, [activeTab, events, query, registeredIds])

  async function register(event) {
    if (!email.trim()) {
      setNotice('Add your email to reserve a place.')
      return
    }
    setSaving(true)
    setNotice('')
    try {
      const user = await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      })
      localStorage.setItem(USER_KEY, user.id)
      localStorage.setItem(EMAIL_KEY, user.email || email.trim())
      setUserId(user.id)
      const registration = await api('/api/registrations', {
        method: 'POST',
        body: JSON.stringify({ user_id: user.id, event_id: event.id }),
      })
      setRegistrations((current) => current.some((item) => item.id === registration.id)
        ? current : [...current, registration])
      setNotice('You’re on the list. See you there!')
      await loadEvents()
    } catch (requestError) {
      if (/already registered/i.test(requestError.message)) {
        await loadRegistrations()
        setNotice('You’re already registered for this event.')
      } else {
        setNotice(requestError.message)
      }
    } finally {
      setSaving(false)
    }
  }

  const registeredCount = registrations.length

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="Gather home">
          <span className="brand-mark">g<span>.</span></span>
          <span>gather</span>
        </a>
        <div className="side-label">YOUR SPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          <button className={activeTab === 'discover' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('discover')}>
            <span className="nav-icon">⌕</span> Discover <span className="nav-arrow">↗</span>
          </button>
          <button className={activeTab === 'tickets' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('tickets')}>
            <span className="nav-icon">▤</span> My registrations <span className="nav-count">{registeredCount}</span>
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="note-spark">✳</span>
          <p>Good things happen when we get together.</p>
          <span className="note-caption">FIND YOUR PEOPLE</span>
        </div>
        <div className="sidebar-footer"><span className="online-dot" /> EVENTS IN YOUR COMMUNITY</div>
      </aside>

      <main className="main-content" id="top">
        <header className="topbar">
          <div className="breadcrumb">EXPLORE <span>/</span> EVENTS</div>
          <div className="profile-chip"><span className="profile-avatar">{email ? email[0].toUpperCase() : '✳'}</span><span>{email || 'Guest explorer'}</span></div>
        </header>

        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span /> OPEN DOORS, GOOD COMPANY</div>
            <h1>{activeTab === 'tickets' ? <>Your plans,<br /><em>all in one place.</em></> : <>Make room for<br /><em>something good.</em></>}</h1>
            <p>{activeTab === 'tickets' ? 'The events you’ve signed up for are right here.' : 'Find a new idea, a new friend, or just a really good afternoon.'}</p>
            <a href="#event-list" className="hero-cta">{activeTab === 'tickets' ? 'VIEW YOUR PLANS' : 'FIND YOUR NEXT THING'} <span>↓</span></a>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
            <div className="hero-sun">✳</div><div className="hero-sticker">COME<br />AS YOU<br />ARE <span>↗</span></div>
            <div className="hero-caption">A LITTLE MORE<br />TOGETHER</div>
          </div>
          <div className="hero-index">01 <span>—</span> 03</div>
        </section>

        <section className="events-section" id="event-list">
          <div className="section-heading">
            <div><div className="eyebrow muted-eyebrow">A GOOD PLACE TO START</div><h2>{activeTab === 'tickets' ? 'Your registrations' : 'Happening around you'} <span>✳</span></h2></div>
            <div className="event-controls">
              <label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an event" aria-label="Find an event" /><kbd>/</kbd></label>
              <span className="result-count">{visibleEvents.length.toString().padStart(2, '0')} EVENTS</span>
            </div>
          </div>

          {loading ? <div className="loading-state"><span className="loader" /> Gathering the good stuff…</div> : null}
          {!loading && error ? <div className="error-state"><span>Couldn’t reach the events right now.</span><small>{error}</small><button onClick={loadEvents}>Try again <span>↗</span></button></div> : null}
          {!loading && !error && visibleEvents.length === 0 ? <div className="empty-state"><span className="empty-glyph">◌</span><h3>{activeTab === 'tickets' ? 'Your calendar has room.' : 'Nothing matches just yet.'}</h3><p>{activeTab === 'tickets' ? 'Explore events and save a spot to see your plans here.' : 'Try another search or check back soon.'}</p>{activeTab === 'tickets' && <button onClick={() => setActiveTab('discover')}>Explore events <span>↗</span></button>}</div> : null}

          <div className="event-grid">
            {visibleEvents.map((event, index) => {
              const isRegistered = registeredIds.has(event.id)
              return <article className={`event-card card-${index % 4}`} key={event.id}>
                <button className="card-open" onClick={() => { setSelected(event); setNotice('') }} aria-label={`View ${event.title}`}>
                  <div className="card-art"><div className="card-art-ring" /><EventGlyph index={index} /><span className="card-number">NO. {String(index + 1).padStart(2, '0')}</span><span className="card-status">{formatStatus(event.status) || 'event'}</span></div>
                  <div className="card-body"><div className="card-kicker">GATHERING <span>✳</span></div><h3>{event.title || 'Untitled gathering'}</h3><div className="card-meta"><span>CAPACITY</span><span>{event.capacity == null ? 'OPEN' : `${event.capacity} PLACES`}</span></div><div className="card-bottom"><span>{isRegistered ? 'YOU’RE ON THE LIST' : 'DETAILS & REGISTRATION'}</span><span className="round-arrow">↗</span></div></div>
                </button>
              </article>
            })}
          </div>
        </section>
        <footer className="page-footer"><span>GATHER A LITTLE MORE.</span><span>MADE FOR THE MOMENTS IN BETWEEN <b>✳</b></span></footer>
      </main>

      {selected && <div className="modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setSelected(null) }}>
        <section className="event-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <button className="modal-close" aria-label="Close details" onClick={() => setSelected(null)}>×</button>
          <div className="modal-art"><EventGlyph index={events.findIndex((event) => event.id === selected.id)} /><span>GATHER A LITTLE MORE</span><div>✳</div></div>
          <div className="modal-content"><div className="eyebrow muted-eyebrow">EVENT DETAILS <span>·</span> {formatStatus(selected.status).toUpperCase() || 'OPEN'}</div><h2 id="modal-title">{selected.title || 'Untitled gathering'}</h2><div className="modal-facts"><div><span>CAPACITY</span><b>{selected.capacity == null ? 'Open spaces' : `${selected.capacity} people`}</b></div><div><span>EVENT ID</span><b className="id-text">{selected.id}</b></div></div>
            <label className="email-label" htmlFor="attendee-email">YOUR EMAIL ADDRESS</label><input id="attendee-email" className="email-input" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            <p className="privacy-note">No account or password needed. We’ll use this email to keep your registration attached to this browser.</p>
            {notice && <div className={notice.includes('list') || notice.includes('registered') ? 'notice success' : 'notice'} role="status">{notice}</div>}
            <button className="register-button" onClick={() => register(selected)} disabled={saving || registeredIds.has(selected.id)}>{saving ? 'SAVING YOUR SPOT…' : registeredIds.has(selected.id) ? 'YOU’RE REGISTERED' : 'SAVE MY SPOT'} <span>{registeredIds.has(selected.id) ? '✓' : '↗'}</span></button>
          </div>
        </section>
      </div>}
    </div>
  )
}

export default App
