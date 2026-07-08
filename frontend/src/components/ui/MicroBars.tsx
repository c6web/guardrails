import MiniBarChart from './MiniBarChart'

interface MicroBarsProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

const MicroBars: React.FC<MicroBarsProps> = ({ data, width, height, color }) => {
  return <MiniBarChart values={data} width={width} height={height} color={color} mode="svg" />
}

export default MicroBars
