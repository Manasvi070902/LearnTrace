import { FrictionReport, FrictionScore } from '../types';
import { CreatorActionsView } from './CreatorActionsView';

interface ConfusionMapViewProps {
  videoId: string;
  report: FrictionReport;
  confusionMap: FrictionScore[];
}

/** The creator view deliberately translates the stored analysis into plain language. */
export function ConfusionMapView({ videoId, report: _report, confusionMap: _confusionMap }: ConfusionMapViewProps) {
  return (
    <section className="confusion-map-section creator-results-view">
      <CreatorActionsView videoId={videoId} />
    </section>
  );
}
