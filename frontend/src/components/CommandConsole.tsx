import React, { useState } from "react";

interface Props {
  onCommand: (input: string) => void;
  log: string[];
}

const CommandConsole: React.FC<Props> = ({ onCommand, log }) => {
  const [value, setValue] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    onCommand(value);
    setValue("");
  };

  return (
    <div className="panel">
      <h3 className="section-title">Command Console</h3>
      <form onSubmit={submit} className="field">
        <input
          className="console"
          placeholder="PLACE VC @ H7"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit">Run</button>
      </form>
      <div className="console-log">
        {log.map((entry) => (
          <div key={entry}>{entry}</div>
        ))}
      </div>
    </div>
  );
};

export default CommandConsole;
