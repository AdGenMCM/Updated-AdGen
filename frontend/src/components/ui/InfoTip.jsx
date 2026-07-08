import "./ui.css";

export default function InfoTip({ text }) {
  return (
    <span className="ui-info-tip" tabIndex="0">
      i
      <span className="ui-info-tip-box">
        {text}
      </span>
    </span>
  );
}