import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Cpu,
  ImagePlus,
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
