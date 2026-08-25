import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Puzzle, Search } from 'lucide-react';
import {
  BlockCanvas,
  ExampleCanvas,
  getAllBlockDocs,
  getBlockDoc,
  getDocCategories,
  getExampleById,
  type ResolvedBlockDoc,
} from '../features/blockDocs';
import type { BoardKey } from '../blockly/boards';
import './DocumentationScreen.css';

export interface DocumentationScreenProps {
  /** Permite que outra tela (ex. Componentes) abra a Documentação já num bloco específico. */
  focusBlockType?: string;
}

const BOARD_LABELS: Record<BoardKey, string> = {
  uno: 'Arduino Uno',
  nano: 'Arduino Nano',
  esp32: 'ESP32',
};

const PORT_TYPE_LABELS: Record<string, string> = {
  Number: 'Número',
  Boolean: 'Verdadeiro/Falso',
  String: 'Texto',
  Any: 'Número, Verdadeiro/Falso ou Texto',
};

function portTypeLabel(type: string): string {
  return PORT_TYPE_LABELS[type] ?? type;
}

function categoryMatches(doc: ResolvedBlockDoc, category: string) {
  return category === 'all' || doc.category === category;
}

function queryMatches(doc: ResolvedBlockDoc, query: string) {
  if (!query) return true;
  const searchableText = [doc.displayName, doc.summary, doc.category].join(' ').toLocaleLowerCase('pt-BR');
  return searchableText.includes(query);
}

function BlockBadges({ doc }: { doc: ResolvedBlockDoc }) {
  if (!doc.boardOnly && !doc.setupOnly && !doc.singletonMessage) return null;
  return (
    <div className="block-doc-badges">
      {doc.boardOnly && <span className="block-doc-badge block-doc-badge--board">Só disponível para {BOARD_LABELS[doc.boardOnly]}</span>}
      {doc.setupOnly && <span className="block-doc-badge block-doc-badge--setup">Use dentro do PREPARAR</span>}
      {doc.singletonMessage && <span className="block-doc-badge block-doc-badge--singleton">{doc.singletonMessage}</span>}
    </div>
  );
}

function BlockChipList({ title, types, onSelect }: { title: string; types: string[]; onSelect: (type: string) => void }) {
  if (types.length === 0) return null;
  return (
    <section className="block-doc-card">
      <span className="block-doc-card__label">{title}</span>
      <div className="block-doc-chip-list">
        {types.map((type) => {
          const doc = getBlockDoc(type);
          return (
            <button type="button" key={type} className="block-doc-chip block-doc-chip--interactive" onClick={() => onSelect(type)}>
              {doc?.displayName ?? type}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DocumentationHub({
  selectedCategory,
  search,
  board,
  onCategoryChange,
  onSearchChange,
  onBoardChange,
  onSelectBlock,
}: {
  selectedCategory: string;
  search: string;
  board: BoardKey;
  onCategoryChange: (category: string) => void;
  onSearchChange: (value: string) => void;
  onBoardChange: (board: BoardKey) => void;
  onSelectBlock: (type: string) => void;
}) {
  const normalizedQuery = search.trim().toLocaleLowerCase('pt-BR');
  const allDocs = useMemo(() => getAllBlockDocs(), []);
  const categories = useMemo(() => getDocCategories(), []);
  const docs = useMemo(
    () => allDocs.filter((doc) => categoryMatches(doc, selectedCategory) && queryMatches(doc, normalizedQuery)),
    [allDocs, normalizedQuery, selectedCategory],
  );

  return (
    <main className="documentation-screen documentation-screen--hub" aria-labelledby="documentation-title">
      <header className="documentation-header">
        <div>
          <span className="documentation-kicker">Documentação</span>
          <h1 id="documentation-title">Manual dos blocos</h1>
          <p>Veja o que cada bloco faz, como conectar e um exemplo pronto — direto com os blocos reais do Bloquin.</p>
        </div>
        <span className="documentation-header-mark" aria-hidden="true"><BookOpen /></span>
      </header>

      <section className="documentation-explorer" aria-label="Explorar blocos">
        <label className="documentation-search">
          <Search aria-hidden="true" />
          <span className="documentation-visually-hidden">Buscar bloco</span>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar bloco por nome…"
          />
        </label>
        <div className="documentation-board-picker" role="group" aria-label="Placa usada nos exemplos">
          {(Object.keys(BOARD_LABELS) as BoardKey[]).map((key) => (
            <button
              type="button"
              key={key}
              className={`documentation-board-option${board === key ? ' documentation-board-option--active' : ''}`}
              aria-pressed={board === key}
              onClick={() => onBoardChange(key)}
            >
              {BOARD_LABELS[key]}
            </button>
          ))}
        </div>
        <span className="documentation-count" aria-live="polite">{docs.length} {docs.length === 1 ? 'bloco' : 'blocos'}</span>
      </section>

      <nav className="documentation-category-section" aria-label="Categorias de blocos">
        <button
          type="button"
          className={`documentation-category${selectedCategory === 'all' ? ' documentation-category--active' : ''}`}
          aria-pressed={selectedCategory === 'all'}
          onClick={() => onCategoryChange('all')}
        >
          Todos <small>{allDocs.length}</small>
        </button>
        {categories.map((category) => {
          const count = allDocs.filter((doc) => doc.category === category).length;
          if (count === 0) return null;
          return (
            <button
              type="button"
              key={category}
              className={`documentation-category${selectedCategory === category ? ' documentation-category--active' : ''}`}
              aria-pressed={selectedCategory === category}
              onClick={() => onCategoryChange(category)}
            >
              {category} <small>{count}</small>
            </button>
          );
        })}
      </nav>

      {docs.length ? (
        <section className="documentation-grid" aria-label="Blocos disponíveis">
          {docs.map((doc) => (
            <button
              type="button"
              className="block-doc-card-button"
              key={doc.type}
              onClick={() => onSelectBlock(doc.type)}
              aria-label={`Abrir detalhes do bloco ${doc.displayName}`}
            >
              <BlockCanvas type={doc.type} board={board} label={doc.displayName} />
              <span className="block-doc-card-button__content">
                <small>{doc.category}</small>
                <strong>{doc.displayName}</strong>
                <span>{doc.summary}</span>
              </span>
            </button>
          ))}
        </section>
      ) : (
        <section className="documentation-empty" aria-live="polite">
          <Search aria-hidden="true" />
          <h2>Não achei esse bloco</h2>
          <p>Tente outro nome ou veja todas as categorias.</p>
          <button type="button" className="btn-secondary" onClick={() => { onSearchChange(''); onCategoryChange('all'); }}>Ver todos os blocos</button>
        </section>
      )}
    </main>
  );
}

function DocumentationDetail({
  doc,
  board,
  onBack,
  onSelectBlock,
}: {
  doc: ResolvedBlockDoc;
  board: BoardKey;
  onBack: () => void;
  onSelectBlock: (type: string) => void;
}) {
  const examples = doc.exampleIds.map(getExampleById).filter((example): example is NonNullable<typeof example> => Boolean(example));

  return (
    <main className="documentation-screen documentation-screen--detail" aria-labelledby="documentation-detail-title">
      <button type="button" className="documentation-back-button btn-ghost" onClick={onBack}>
        <ArrowLeft aria-hidden="true" /> Voltar para Documentação
      </button>

      <header className="block-doc-detail-header">
        <BlockCanvas type={doc.type} board={board} label={doc.displayName} />
        <div>
          <span className="documentation-kicker">{doc.category}</span>
          <h1 id="documentation-detail-title">{doc.displayName}</h1>
          <p>{doc.summary}</p>
          <BlockBadges doc={doc} />
        </div>
      </header>

      <div className="documentation-detail-layout">
        <section className="block-doc-card">
          <span className="block-doc-card__label">O que faz</span>
          <p>{doc.whatItDoes}</p>
        </section>

        <section className="block-doc-card">
          <span className="block-doc-card__label">Quando usar</span>
          <p>{doc.whenToUse}</p>
        </section>

        {(doc.inputs.length > 0 || doc.output) && (
          <section className="block-doc-card block-doc-card--wide">
            <span className="block-doc-card__label">Entradas e saída</span>
            <div className="block-doc-ports">
              {doc.inputs.map((input) => (
                <article className="block-doc-port" key={input.name}>
                  <strong>{input.name}</strong>
                  <span>{portTypeLabel(input.type)}</span>
                </article>
              ))}
              {doc.output && (
                <article className="block-doc-port block-doc-port--output">
                  <strong>Saída</strong>
                  <span>{portTypeLabel(doc.output.type)}</span>
                </article>
              )}
            </div>
          </section>
        )}

        {doc.pinRequirements.length > 0 && (
          <section className="block-doc-card">
            <span className="block-doc-card__label">Pinos</span>
            <ul className="block-doc-plain-list">
              {doc.pinRequirements.map((requirement) => (
                <li key={requirement.field}>{requirement.field}: precisa de um pino compatível ({requirement.capability})</li>
              ))}
            </ul>
          </section>
        )}

        {doc.dependencyNotes.length > 0 && (
          <section className="block-doc-card">
            <span className="block-doc-card__label">Depende de</span>
            <ul className="block-doc-plain-list">
              {doc.dependencyNotes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </section>
        )}

        <BlockChipList title="Requer antes" types={doc.requires.map((requirement) => requirement.requiresType)} onSelect={onSelectBlock} />
        <BlockChipList title="Normalmente usado com" types={doc.usedWith} onSelect={onSelectBlock} />

        {doc.relatedComponentNames.length > 0 && (
          <section className="block-doc-card">
            <span className="block-doc-card__label">Componentes relacionados</span>
            <div className="block-doc-chip-list">
              {doc.relatedComponentNames.map((name) => <span key={name} className="block-doc-chip">{name}</span>)}
            </div>
          </section>
        )}

        {examples.length > 0 && (
          <section className="block-doc-card block-doc-card--wide">
            <div className="block-doc-section-heading">
              <div><span className="block-doc-card__label">Exemplo prático</span><h2>Veja o bloco em uso</h2></div>
              <Puzzle aria-hidden="true" />
            </div>
            <div className="block-doc-example-list">
              {examples.map((example) => (
                <article className="block-doc-example" key={example.id}>
                  <h3>{example.title}</h3>
                  <ExampleCanvas example={example} />
                  <p>{example.caption}</p>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

/** Hub e detalhe ficam na mesma aba, como Componentes, para preservar o contexto da aula. */
export function DocumentationScreen({ focusBlockType }: DocumentationScreenProps) {
  const [selectedType, setSelectedType] = useState<string | null>(focusBlockType ?? null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [board, setBoard] = useState<BoardKey>('uno');

  useEffect(() => {
    if (focusBlockType) setSelectedType(focusBlockType);
  }, [focusBlockType]);

  const selectedDoc = selectedType ? getBlockDoc(selectedType) : null;
  if (selectedDoc) {
    return (
      <DocumentationDetail
        doc={selectedDoc}
        board={selectedDoc.boardOnly ?? board}
        onBack={() => setSelectedType(null)}
        onSelectBlock={setSelectedType}
      />
    );
  }

  return (
    <DocumentationHub
      selectedCategory={selectedCategory}
      search={search}
      board={board}
      onCategoryChange={setSelectedCategory}
      onSearchChange={setSearch}
      onBoardChange={setBoard}
      onSelectBlock={setSelectedType}
    />
  );
}
