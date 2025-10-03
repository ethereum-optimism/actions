export const colors = {
  // Actions brand red - kept as requested
  actionsRed: '#FF0621',

  // Gruvbox dark medium palette
  bg: {
    dark: '#1d2021', // dark0_hard - website background
    code: '#282828', // dark0 - terminal/code block background
    header: '#282828', // dark0 - terminal header (same as code)
  },
  text: {
    primary: '#ebdbb2', // light1
    secondary: '#d5c4a1', // light2
  },
  syntax: {
    keyword: '#fb4933', // bright red
    function: '#fe8019', // bright orange
    string: '#fabd2f', // bright yellow
    variable: '#b8bb26', // bright green
    property: '#83a598', // bright blue
    number: '#d3869b', // bright purple
    comment: '#928374', // gray
  },
  macos: {
    red: '#ff5f56',
    yellow: '#ffbd2e',
    green: '#b8bb26', // gruvbox bright green
  },
} as const
