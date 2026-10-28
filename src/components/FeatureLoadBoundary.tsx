import { Component, type ReactNode } from 'react';

export class FeatureLoadBoundary extends Component<{ label: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="emptyState" role="alert">
      <p>{this.props.label} 화면을 불러오지 못했어요.</p>
      <button className="emptyStateAction" onClick={() => window.location.reload()}>앱 다시 불러오기</button>
    </div>;
  }
}
