import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Braces,
  Check,
  CircleAlert,
  Cpu,
  ImagePlus,
  Lightbulb,
  Puzzle,
  Search,
  Wrench,
} from 'lucide-react';
import {
  COMPONENT_CATALOG,
  COMPONENT_CATEGORIES,
  getComponentById,
  getComponentsByCategory,
  type ComponentBlockLink,
  type ComponentCatalogItem,
  type ComponentCategoryId,
  type ComponentId,
  type ComponentIllustrationId,
  type ComponentMediaImage,
  type ComponentPart,
} from '../features/components';
import './ComponentsScreen.css';

export interface ComponentsScreenProps {
  /** Permite que uma futura rota/aba abra um item específico do catálogo. */
  initialComponentId?: ComponentId | null;
  /** Sincronização opcional com a navegação externa, sem depender dela. */
  onSelectedComponentChange?: (componentId: ComponentId | null) => void;
  /** Ponto de extensão para uma futura integração com a caixa de ferramentas do IDE. */
  onOpenBlocklyBlock?: (block: ComponentBlockLink, component: ComponentCatalogItem) => void;
}

type VisualSize = 'card' | 'detail' | 'related';
type MediaRole = 'main' | 'pinout' | 'connection';

const MEDIA_SLOT_COPY: Record<MediaRole, { title: string; hint: string; asset: string }> = {
  main: { title: 'Foto da peça', hint: 'Compare com a peça que está na sua mesa.', asset: 'foto principal' },
  pinout: { title: 'Pinos', hint: 'Veja o nome de cada pino antes de ligar.', asset: 'imagem de pinagem' },
  connection: { title: 'Como ligar', hint: 'Use este esquema como referência de montagem.', asset: 'esquema de ligação' },
};

function ComponentIllustration({ kind }: { kind: ComponentIllustrationId }) {
  switch (kind) {
    case 'led':
      return <div className="component-illustration component-illustration--led"><span /><i /><b /><em /></div>;
    case 'resistor':
      return <div className="component-illustration component-illustration--resistor"><i /><b>Ω</b><i /></div>;
    case 'button':
      return <div className="component-illustration component-illustration--button"><span /><i /><i /></div>;
    case 'buzzer':
      return <div className="component-illustration component-illustration--buzzer"><span>♫</span><i /><i /></div>;
    case 'ldr':
      return <div className="component-illustration component-illustration--ldr"><span /><i /><b>↗</b></div>;
    case 'ultrasonic':
      return <div className="component-illustration component-illustration--ultrasonic"><i /><i /><span>)))</span></div>;
    case 'imu':
      return <div className="component-illustration component-illustration--imu"><span>XYZ</span><i /><i /><i /></div>;
    case 'driver':
      return <div className="component-illustration component-illustration--driver"><span>L298N</span><i /><i /><i /><i /></div>;
    case 'motor':
      return <div className="component-illustration component-illustration--motor"><span /><i /><b>↻</b></div>;
    case 'board':
      return <div className="component-illustration component-illustration--board"><span>DEV</span><i /><i /><i /></div>;
  }
}

/** Kinds com desenho de anatomia numerado; os demais caem na grade simples de partes. */
type AnatomyKind = 'led' | 'resistor' | 'button' | 'buzzer' | 'ldr';

const ANATOMY_VIEWBOX: Record<AnatomyKind, string> = {
  led: '0 0 220 210',
  resistor: '0 0 220 150',
  button: '0 0 220 180',
  buzzer: '0 0 220 200',
  ldr: '0 0 220 190',
};

/** Cada marcador aponta para um ponto do desenho e se liga ao `parts[partIndex]` do componente. */
const ANATOMY_MARKERS: Record<AnatomyKind, ReadonlyArray<{ x: number; y: number; partIndex: number }>> = {
  led: [
    { x: 110, y: 50, partIndex: 0 },
    { x: 146, y: 160, partIndex: 1 },
    { x: 66, y: 140, partIndex: 2 },
    { x: 52, y: 111, partIndex: 3 },
  ],
  resistor: [
    { x: 70, y: 58, partIndex: 0 },
    { x: 132, y: 58, partIndex: 1 },
    { x: 28, y: 88, partIndex: 2 },
    { x: 192, y: 88, partIndex: 2 },
  ],
  button: [
    { x: 60, y: 30, partIndex: 0 },
    { x: 110, y: 46, partIndex: 1 },
    { x: 78, y: 163, partIndex: 2 },
    { x: 142, y: 163, partIndex: 3 },
  ],
  buzzer: [
    { x: 152, y: 42, partIndex: 0 },
    { x: 82, y: 92, partIndex: 1 },
    { x: 74, y: 184, partIndex: 2 },
    { x: 150, y: 170, partIndex: 3 },
  ],
  ldr: [
    { x: 146, y: 62, partIndex: 0 },
    { x: 156, y: 116, partIndex: 1 },
    { x: 74, y: 166, partIndex: 2 },
    { x: 146, y: 166, partIndex: 2 },
  ],
};

function isAnatomyKind(kind: ComponentIllustrationId): kind is AnatomyKind {
  return kind === 'led' || kind === 'resistor' || kind === 'button' || kind === 'buzzer' || kind === 'ldr';
}

function AnatomyMarker({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g className="component-anatomy-marker">
      <circle cx={x} cy={y} r="12" />
      <text x={x} y={y} dy="0.35em">{n}</text>
    </g>
  );
}

function AnatomyArtwork({ kind }: { kind: AnatomyKind }) {
  switch (kind) {
    case 'led':
      return (
        <>
          <defs>
            <radialGradient id="anatomy-led-dome" cx="38%" cy="28%" r="75%">
              <stop offset="0%" stopColor="#ffe4e1" />
              <stop offset="35%" stopColor="#ff7280" />
              <stop offset="100%" stopColor="#e43853" />
            </radialGradient>
          </defs>
          <path d="M85,78 C85,38 135,38 135,78 Z" fill="url(#anatomy-led-dome)" stroke="#b82743" strokeWidth="3" />
          <rect x="85" y="76" width="50" height="42" fill="url(#anatomy-led-dome)" stroke="#b82743" strokeWidth="3" />
          <ellipse cx="110" cy="119" rx="36" ry="7" fill="#a5243d" />
          <path d="M76,119 L92,119" stroke="#7a1f34" strokeWidth="7" strokeLinecap="round" />
          <line x1="95" y1="119" x2="95" y2="155" stroke="#5b6672" strokeWidth="6" strokeLinecap="round" />
          <line x1="125" y1="119" x2="125" y2="175" stroke="#5b6672" strokeWidth="6" strokeLinecap="round" />
        </>
      );
    case 'resistor':
      return (
        <>
          <line x1="8" y1="75" x2="70" y2="75" stroke="#8a9dad" strokeWidth="6" strokeLinecap="round" />
          <line x1="150" y1="75" x2="212" y2="75" stroke="#8a9dad" strokeWidth="6" strokeLinecap="round" />
          <rect x="70" y="50" width="80" height="50" rx="14" fill="#deb17b" stroke="#9a5429" strokeWidth="4" />
          <rect x="84" y="50" width="8" height="50" fill="#7a4a1e" />
          <rect x="98" y="50" width="8" height="50" fill="#d04537" />
          <rect x="112" y="50" width="8" height="50" fill="#f1cd92" />
          <rect x="126" y="50" width="8" height="50" fill="#5c80a2" />
        </>
      );
    case 'button':
      return (
        <>
          <rect x="55" y="40" width="110" height="80" rx="16" fill="#eef2f5" stroke="#576d81" strokeWidth="4" />
          <ellipse cx="110" cy="76" rx="27" ry="18" fill="#ffba4d" stroke="#6e8192" strokeWidth="4" />
          <line x1="72" y1="120" x2="72" y2="150" stroke="#687987" strokeWidth="6" strokeLinecap="round" />
          <line x1="88" y1="120" x2="88" y2="150" stroke="#687987" strokeWidth="6" strokeLinecap="round" />
          <line x1="132" y1="120" x2="132" y2="150" stroke="#687987" strokeWidth="6" strokeLinecap="round" />
          <line x1="148" y1="120" x2="148" y2="150" stroke="#687987" strokeWidth="6" strokeLinecap="round" />
        </>
      );
    case 'buzzer':
      return (
        <>
          <defs>
            <radialGradient id="anatomy-buzzer-disc" cx="50%" cy="45%" r="65%">
              <stop offset="0%" stopColor="#5d7990" />
              <stop offset="60%" stopColor="#3b5872" />
              <stop offset="100%" stopColor="#203448" />
            </radialGradient>
          </defs>
          <circle cx="110" cy="95" r="58" fill="#25394e" stroke="#152634" strokeWidth="4" />
          <circle cx="110" cy="95" r="34" fill="url(#anatomy-buzzer-disc)" />
          <circle cx="110" cy="95" r="10" fill="#25394e" />
          <line x1="95" y1="150" x2="95" y2="180" stroke="#d1b35c" strokeWidth="6" strokeLinecap="round" />
          <line x1="125" y1="150" x2="125" y2="170" stroke="#d1b35c" strokeWidth="6" strokeLinecap="round" />
        </>
      );
    case 'ldr':
      return (
        <>
          <circle cx="110" cy="95" r="50" fill="#efc179" stroke="#a06a36" strokeWidth="5" />
          <path d="M76,95 L90,72 L100,108 L112,68 L124,108 L134,78 L144,95" fill="none" stroke="#7a4a1e" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="90" y1="140" x2="90" y2="172" stroke="#6f7982" strokeWidth="5" strokeLinecap="round" />
          <line x1="130" y1="140" x2="130" y2="172" stroke="#6f7982" strokeWidth="5" strokeLinecap="round" />
        </>
      );
  }
}

function ComponentAnatomyDiagram({ kind, parts }: { kind: AnatomyKind; parts: readonly ComponentPart[] }) {
  return (
    <div className="component-anatomy">
      <svg className="component-anatomy-figure" viewBox={ANATOMY_VIEWBOX[kind]} role="img" aria-label="Desenho com as partes numeradas da peça">
        <AnatomyArtwork kind={kind} />
        {ANATOMY_MARKERS[kind].map((marker, index) => <AnatomyMarker key={index} x={marker.x} y={marker.y} n={marker.partIndex + 1} />)}
      </svg>
      <ol className="component-anatomy-legend component-connections">
        {parts.map((part, index) => (
          <li key={part.label}>
            <span aria-hidden="true">{index + 1}</span>
            <div><strong>{part.label}</strong><p>{part.description}</p></div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ComponentPartsGrid({ parts }: { parts: readonly ComponentPart[] }) {
  return (
    <div className="component-parts-grid">
      {parts.map((part, index) => (
        <article className="component-part-card" key={part.label}>
          <span aria-hidden="true">{index + 1}</span>
          <div><strong>{part.label}</strong><p>{part.description}</p></div>
        </article>
      ))}
    </div>
  );
}

function ComponentPartsSection({ component }: { component: ComponentCatalogItem }) {
  return isAnatomyKind(component.illustration)
    ? <ComponentAnatomyDiagram kind={component.illustration} parts={component.parts} />
    : <ComponentPartsGrid parts={component.parts} />;
}

function getMedia(item: ComponentCatalogItem, role: MediaRole): ComponentMediaImage | undefined {
  return item.media.find((media): media is ComponentMediaImage => media.kind === 'image' && media.role === role);
}

function ComponentVisual({ item, size }: { item: ComponentCatalogItem; size: VisualSize }) {
  const image = getMedia(item, 'main');
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [image?.src, item.id]);

  return (
    <div className={`component-visual component-visual--${size}`}>
      {image && !imageFailed ? (
        <img
          src={image.src}
          alt={size === 'detail' ? image.alt : ''}
          draggable="false"
          loading={size === 'detail' ? 'eager' : 'lazy'}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <ComponentIllustration kind={item.illustration} />
      )}
    </div>
  );
}

function ComponentMediaSlot({ component, role }: { component: ComponentCatalogItem; role: MediaRole }) {
  const media = getMedia(component, role);
  const [imageFailed, setImageFailed] = useState(false);
  const copy = MEDIA_SLOT_COPY[role];

  useEffect(() => {
    setImageFailed(false);
  }, [media?.src, role]);

  return (
    <figure className="component-media-slot">
      <figcaption>
        <strong>{copy.title}</strong>
        <span>{copy.hint}</span>
      </figcaption>
      {media && !imageFailed ? (
        <img src={media.src} alt={media.alt} draggable="false" onError={() => setImageFailed(true)} />
      ) : (
        <div className="component-media-placeholder">
          <ComponentIllustration kind={component.illustration} />
          <span data-asset-path={`src/assets/components/${component.id}/${role}.webp`}><ImagePlus aria-hidden="true" /><strong>Imagem em preparação</strong><small>Imagem de referência ainda não adicionada.</small></span>
        </div>
      )}
    </figure>
  );
}

function categoryMatches(component: ComponentCatalogItem, categoryId: ComponentCategoryId | 'all') {
  return categoryId === 'all' || component.categoryId === categoryId;
}

function queryMatches(component: ComponentCatalogItem, query: string) {
  if (!query) return true;
  const searchableText = [component.name, component.summary, component.purpose, ...component.tags]
    .join(' ')
    .toLocaleLowerCase('pt-BR');
  return searchableText.includes(query);
}

function RelatedBlock({
  block,
  component,
  onOpen,
}: {
  block: ComponentBlockLink;
  component: ComponentCatalogItem;
  onOpen?: ComponentsScreenProps['onOpenBlocklyBlock'];
}) {
  const contents = <><strong>{block.label}</strong><small>{block.toolboxCategory}</small></>;

  if (!onOpen) return <span className="component-block-chip">{contents}</span>;

  return (
    <button
      type="button"
      className="component-block-chip component-block-chip--interactive"
      onClick={() => onOpen(block, component)}
      title={block.description ?? `Abrir o bloco ${block.label}`}
    >
      {contents}
    </button>
  );
}

function ComponentHub({
  selectedCategory,
  search,
  onCategoryChange,
  onSearchChange,
  onSelectComponent,
}: {
  selectedCategory: ComponentCategoryId | 'all';
  search: string;
  onCategoryChange: (categoryId: ComponentCategoryId | 'all') => void;
  onSearchChange: (value: string) => void;
  onSelectComponent: (componentId: ComponentId) => void;
}) {
  const normalizedQuery = search.trim().toLocaleLowerCase('pt-BR');
  const components = useMemo(
    () => COMPONENT_CATALOG.filter((component) => categoryMatches(component, selectedCategory) && queryMatches(component, normalizedQuery)),
    [normalizedQuery, selectedCategory],
  );
  const categories = useMemo(
    () => COMPONENT_CATEGORIES.filter((category) => getComponentsByCategory(category.id).length > 0),
    [],
  );

  return (
    <main className="components-screen components-screen--hub" aria-labelledby="components-title">
      <header className="components-header">
        <div>
          <span className="components-kicker">Componentes</span>
          <h1 id="components-title">Que peça é essa?</h1>
          <p>Encontre a peça e veja como usar.</p>
        </div>
        <span className="components-header-mark" aria-hidden="true"><Cpu /></span>
      </header>

      <section className="components-explorer" aria-label="Explorar componentes">
        <label className="components-search">
          <Search aria-hidden="true" />
          <span className="components-visually-hidden">Buscar componente</span>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar LED, sensor, motor…"
          />
        </label>
        <span className="components-count" aria-live="polite">{components.length} {components.length === 1 ? 'peça' : 'peças'}</span>
      </section>

      <nav className="components-category-section" aria-label="Categorias de componentes">
        <button
          type="button"
          className={`components-category${selectedCategory === 'all' ? ' components-category--active' : ''}`}
          aria-pressed={selectedCategory === 'all'}
          onClick={() => onCategoryChange('all')}
        >
          Todos <small>{COMPONENT_CATALOG.length}</small>
        </button>
        {categories.map((category) => {
          const count = getComponentsByCategory(category.id).length;
          return (
            <button
              key={category.id}
              type="button"
              className={`components-category${selectedCategory === category.id ? ' components-category--active' : ''}`}
              aria-pressed={selectedCategory === category.id}
              onClick={() => onCategoryChange(category.id)}
              title={category.description}
            >
              {category.label} <small>{count}</small>
            </button>
          );
        })}
      </nav>

      {components.length ? (
        <section className="components-grid" aria-label="Componentes disponíveis">
          {components.map((component) => (
            <button
              type="button"
              className="component-card"
              key={component.id}
              onClick={() => onSelectComponent(component.id)}
              aria-label={`Abrir detalhes de ${component.name}`}
            >
              <ComponentVisual item={component} size="card" />
              <span className="component-card__content">
                <small>{COMPONENT_CATEGORIES.find((category) => category.id === component.categoryId)?.label}</small>
                <strong>{component.name}</strong>
                <span>{component.student.whatIs}</span>
              </span>
              <span className="component-card__action">Ver como usar <ArrowRight aria-hidden="true" /></span>
            </button>
          ))}
        </section>
      ) : (
        <section className="components-empty" aria-live="polite">
          <Search aria-hidden="true" />
          <h2>Não achei essa peça</h2>
          <p>Tente outro nome ou veja todas as categorias.</p>
          <button type="button" className="btn-secondary" onClick={() => { onSearchChange(''); onCategoryChange('all'); }}>Ver todas as peças</button>
        </section>
      )}
    </main>
  );
}

function ComponentDetail({
  component,
  onBack,
  onSelectComponent,
  onOpenBlocklyBlock,
}: {
  component: ComponentCatalogItem;
  onBack: () => void;
  onSelectComponent: (componentId: ComponentId) => void;
  onOpenBlocklyBlock?: ComponentsScreenProps['onOpenBlocklyBlock'];
}) {
  const category = COMPONENT_CATEGORIES.find((entry) => entry.id === component.categoryId);
  const relatedComponents = component.relatedComponentIds
    .map(getComponentById)
    .filter((candidate): candidate is ComponentCatalogItem => Boolean(candidate));

  return (
    <main className="components-screen components-screen--detail" aria-labelledby="component-detail-title">
      <button type="button" className="components-back-button btn-ghost" onClick={onBack}>
        <ArrowLeft aria-hidden="true" /> Voltar para Componentes
      </button>

      <header className="component-detail-header">
        <ComponentVisual item={component} size="detail" />
        <div>
          <span className="components-kicker">{category?.label ?? 'Componente'}</span>
          <h1 id="component-detail-title">{component.name}</h1>
          <p>{component.student.whatIs}</p>
          <div className="component-tag-list" aria-label="Dicas rápidas">
            {component.tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        </div>
      </header>

      <div className="component-detail-layout">
        <section className="component-detail-card component-detail-card--what">
          <span className="component-detail-card__label">O que é?</span>
          <p>{component.student.whatIs}</p>
        </section>

        <section className="component-detail-card component-detail-card--use">
          <span className="component-detail-card__label">Para que serve?</span>
          <p>{component.student.usefulFor}</p>
        </section>

        <section className="component-detail-card component-detail-card--wide component-detail-card--howitworks">
          <div className="component-section-heading">
            <div><span className="component-detail-card__label">Como funciona</span><h2>Por dentro da peça</h2></div>
            <Lightbulb aria-hidden="true" />
          </div>
          <p>{component.howItWorks}</p>
        </section>

        <section className="component-detail-card component-detail-card--wide">
          <div className="component-section-heading">
            <div><span className="component-detail-card__label">Partes da peça</span><h2>Aprenda os nomes antes de montar</h2></div>
            <Puzzle aria-hidden="true" />
          </div>
          <ComponentPartsSection component={component} />
        </section>

        <section className="component-detail-media" aria-label={`Imagens de apoio para ${component.name}`}>
          <ComponentMediaSlot component={component} role="main" />
          <ComponentMediaSlot component={component} role="pinout" />
          <ComponentMediaSlot component={component} role="connection" />
        </section>

        <section className="component-detail-card component-detail-card--wide">
          <div className="component-section-heading">
            <div><span className="component-detail-card__label">Pinos</span><h2>Confira antes de ligar</h2></div>
          </div>
          <div className="component-pins-grid">
            {component.pins.map((pin) => (
              <article className={`component-pin component-pin--${pin.role}`} key={pin.label}>
                <strong>{pin.label}</strong>
                <span>{pin.description}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="component-detail-card component-detail-card--wide component-detail-card--connection">
          <div className="component-section-heading">
            <div><span className="component-detail-card__label">Como ligar?</span><h2>{component.student.howToConnect}</h2></div>
          </div>
          <ol className="component-connections">
            {component.connections.map((connection, index) => (
              <li key={connection.title}>
                <span aria-hidden="true">{index + 1}</span>
                <div><strong>{connection.title}</strong><p>{connection.description}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <section className="component-detail-card component-detail-card--facts">
          <span className="component-detail-card__label">Bom saber</span>
          <ul className="component-check-list">
            {component.specifications.map((specification) => <li key={specification}><Check aria-hidden="true" />{specification}</li>)}
          </ul>
        </section>

        <section className="component-detail-card component-detail-card--warning">
          <span className="component-detail-card__label"><CircleAlert aria-hidden="true" /> Atenção</span>
          <p>{component.student.attention}</p>
          <ul>
            {component.cautions.map((caution) => <li key={caution}>{caution}</li>)}
          </ul>
        </section>

        <section className="component-detail-card component-detail-card--wide component-detail-card--blocks">
          <div className="component-section-heading">
            <div><span className="component-detail-card__label">No Bloquin</span><h2>{component.student.bloquinExample}</h2></div>
            <Wrench aria-hidden="true" />
          </div>
          <p className="component-code-logic"><Braces aria-hidden="true" /> {component.codeLogic}</p>
          <div className="component-block-list">
            {component.relatedBlocks.map((block) => (
              <RelatedBlock key={block.blockType} block={block} component={component} onOpen={onOpenBlocklyBlock} />
            ))}
          </div>
        </section>

        {relatedComponents.length > 0 && (
          <section className="component-detail-card component-detail-card--wide">
            <div className="component-section-heading"><div><span className="component-detail-card__label">Pode ajudar</span><h2>Peças usadas junto</h2></div></div>
            <div className="component-related-list">
              {relatedComponents.map((related) => (
                <button type="button" key={related.id} onClick={() => onSelectComponent(related.id)}>
                  <ComponentVisual item={related} size="related" />
                  <span><strong>{related.name}</strong><small>{related.summary}</small></span>
                  <ArrowRight aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

/** Hub e detalhe do catálogo ficam na mesma aba para preservar o contexto da aula. */
export function ComponentsScreen({
  initialComponentId,
  onSelectedComponentChange,
  onOpenBlocklyBlock,
}: ComponentsScreenProps) {
  const [selectedComponentId, setSelectedComponentId] = useState<ComponentId | null>(initialComponentId ?? null);
  const [selectedCategory, setSelectedCategory] = useState<ComponentCategoryId | 'all'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (initialComponentId !== undefined) setSelectedComponentId(initialComponentId);
  }, [initialComponentId]);

  const selectComponent = (componentId: ComponentId) => {
    setSelectedComponentId(componentId);
    onSelectedComponentChange?.(componentId);
  };

  const returnToHub = () => {
    setSelectedComponentId(null);
    onSelectedComponentChange?.(null);
  };

  const selectedComponent = getComponentById(selectedComponentId);
  if (selectedComponent) {
    return <ComponentDetail component={selectedComponent} onBack={returnToHub} onSelectComponent={selectComponent} onOpenBlocklyBlock={onOpenBlocklyBlock} />;
  }

  return <ComponentHub selectedCategory={selectedCategory} search={search} onCategoryChange={setSelectedCategory} onSearchChange={setSearch} onSelectComponent={selectComponent} />;
}
