import * as Blockly from 'blockly/core';

/**
 * Tema visual único do Bloquin. Compartilhado entre a IDE (IdeScreen) e a
 * aba de Documentação para que os blocos renderizados em ambas sejam
 * visualmente idênticos — nenhuma das duas deve definir seu próprio tema.
 */
export const bloquinTheme = Blockly.Theme.defineTheme('bloquinTheme', {
  name: 'bloquinTheme', base: Blockly.Themes.Classic,
  blockStyles: { colour_blocks: { colourPrimary: '#ef9f4b', colourSecondary: '#d4891f', colourTertiary: '#b87219' }, list_blocks: { colourPrimary: '#4cd137', colourSecondary: '#3bac29', colourTertiary: '#2e8a1f' }, logic_blocks: { colourPrimary: '#6c5ce7', colourSecondary: '#5a4ed4', colourTertiary: '#473dbf' }, loop_blocks: { colourPrimary: '#00b894', colourSecondary: '#00a381', colourTertiary: '#008068' }, math_blocks: { colourPrimary: '#0984e3', colourSecondary: '#0773c9', colourTertiary: '#0562af' }, procedure_blocks: { colourPrimary: '#fd79a8', colourSecondary: '#e46d96', colourTertiary: '#cc6284' }, text_blocks: { colourPrimary: '#fdcb6e', colourSecondary: '#e4b55b', colourTertiary: '#cb9e48' }, variable_blocks: { colourPrimary: '#e17055', colourSecondary: '#c85f42', colourTertiary: '#b04e30' }, variable_dynamic_blocks: { colourPrimary: '#e17055', colourSecondary: '#c85f42', colourTertiary: '#b04e30' }, hat_blocks: { colourPrimary: '#a29bfe', colourSecondary: '#9085e3', colourTertiary: '#7e71c8' } },
  componentStyles: { workspaceBackgroundColour: '#eef2f7', toolboxBackgroundColour: '#1a2035', toolboxForegroundColour: '#ffffff', flyoutBackgroundColour: '#242c42', flyoutForegroundColour: '#ffffff', flyoutOpacity: 0.98, scrollbarColour: '#00a8ff', scrollbarOpacity: 0.5, insertionMarkerColour: '#00a8ff', insertionMarkerOpacity: 0.6, markerColour: '#ffffff', cursorColour: '#d0d0d0' },
});
