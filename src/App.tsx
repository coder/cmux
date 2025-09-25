import React from 'react';
import './App.css';

function App() {
  return (
    <div className="App">
      <h1>Hello World</h1>
      <p>Welcome to Cmux - Coding Agent Multiplexer</p>
      <p>Platform: {(window as any).api?.platform}</p>
    </div>
  );
}

export default App;