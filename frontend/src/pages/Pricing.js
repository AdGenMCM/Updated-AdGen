import { Link } from "react-router-dom";

export default function Pricing() {
  return (
    <div style={{ padding: 20 }}>
      <h1>Pricing</h1>
      <p>
        Add your pricing details here. If you’re using Stripe subscriptions, you
        can direct users to the subscribe page below.
      </p>

      <div style={{ marginTop: 16 }}>
        <Link to="/subscribe">Go to Subscribe</Link>
      </div>
    </div>
  );
}
