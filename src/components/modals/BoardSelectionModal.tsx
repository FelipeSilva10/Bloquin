import { useState } from 'react';
import { useModalA11y } from '../../hooks/useModalA11y';
import type { BoardKey } from '../../blockly/boards';
import arduinoUno from '../../assets/arduino_uno.jpg';
import arduinoNano from '../../assets/arduino_nano.jpg';
import esp32DevkitV1 from '../../assets/esp32_devkit_v1.jpg';

interface BoardSelectionModalProps { 
  onSelect: (board: BoardKey) => void; 
}

export function BoardSelectionModal({ onSelect }: BoardSelectionModalProps) {
  const [hovered, setHovered] = useState<BoardKey | null>(null);
  const modalRef = useModalA11y<HTMLDivElement>(() => undefined);
  
  const boards: { key: BoardKey; title: string; color: string; img: string }[] = [
    { key: 'uno',   title: 'Arduino Uno',  color: '#0984e3', img: arduinoUno },
    { key: 'nano',  title: 'Arduino Nano', color: '#ff00d0', img: arduinoNano },
    { key: 'esp32', title: 'ESP32 DevKit', color: '#e17055', img: esp32DevkitV1 },
  ];

  return (
    <div className="modal-overlay" style={{ zIndex: 999999 }}>
      <div ref={modalRef} className="board-modal-card" role="dialog" aria-modal="true" aria-labelledby="board-modal-title">
        <div>
          <h2 id="board-modal-title" className="board-modal-title">Qual placa vamos usar?</h2>
          <p className="board-modal-subtitle">
            <br /><strong>Essa escolha não pode ser alterada.</strong>
          </p>
        </div>
        <div className="board-list">
          {boards.map(({ key, title, color, img }) => (
            <button 
              key={key} 
              onMouseEnter={() => setHovered(key)} 
              onMouseLeave={() => setHovered(null)} 
              type="button"
              onClick={() => onSelect(key)}
              className="board-card"
              style={{ boxShadow: hovered === key ? `0 8px 24px ${color}44` : '' }}
            >
              <div className="board-img-wrap">
                <img src={img} alt={title} className="board-img" />
              </div>
              <span className="board-card-title" style={{ color: hovered === key ? color : '#2f3542' }}>
                {title}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
