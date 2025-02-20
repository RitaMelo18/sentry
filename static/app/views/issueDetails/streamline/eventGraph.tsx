import {useMemo, useState} from 'react';
import {useTheme} from '@emotion/react';
import styled from '@emotion/styled';

import {LinkButton} from 'sentry/components/button';
import {BarChart, type BarChartSeries} from 'sentry/components/charts/barChart';
import Legend from 'sentry/components/charts/components/legend';
import {useChartZoom} from 'sentry/components/charts/useChartZoom';
import InteractionStateLayer from 'sentry/components/interactionStateLayer';
import {IconTelescope} from 'sentry/icons';
import {t, tn} from 'sentry/locale';
import {space} from 'sentry/styles/space';
import type {SeriesDataUnit} from 'sentry/types/echarts';
import type {Group} from 'sentry/types/group';
import type {EventsStats, MultiSeriesEventsStats} from 'sentry/types/organization';
import {SavedQueryDatasets} from 'sentry/utils/discover/types';
import {formatAbbreviatedNumber} from 'sentry/utils/formatters';
import useOrganization from 'sentry/utils/useOrganization';
import {hasDatasetSelector} from 'sentry/views/dashboards/utils';
import useFlagSeries from 'sentry/views/issueDetails/streamline/flagSeries';
import {useIssueDetailsEventView} from 'sentry/views/issueDetails/streamline/useIssueDetailsDiscoverQuery';

export const enum EventGraphSeries {
  EVENT = 'event',
  USER = 'user',
}
interface EventGraphProps {
  group: Group;
  groupStats: MultiSeriesEventsStats;
  searchQuery: string;
}

function createSeriesAndCount(stats: EventsStats) {
  return stats?.data?.reduce(
    (result, [timestamp, countData]) => {
      const count = countData?.[0]?.count ?? 0;
      return {
        series: [
          ...result.series,
          {
            name: timestamp * 1000, // ms -> s
            value: count,
          },
        ],
        count: result.count + count,
      };
    },
    {series: [] as SeriesDataUnit[], count: 0}
  );
}

export function EventGraph({group, groupStats, searchQuery}: EventGraphProps) {
  const theme = useTheme();
  const organization = useOrganization();
  const [visibleSeries, setVisibleSeries] = useState<EventGraphSeries>(
    EventGraphSeries.EVENT
  );

  const [isGraphHovered, setIsGraphHovered] = useState(false);
  const eventStats = groupStats['count()'];
  const {series: eventSeries, count: eventCount} = useMemo(
    () => createSeriesAndCount(eventStats),
    [eventStats]
  );
  const userStats = groupStats['count_unique(user)'];
  const {series: userSeries, count: userCount} = useMemo(
    () => createSeriesAndCount(userStats),
    [userStats]
  );

  const eventView = useIssueDetailsEventView({group, queryProps: {query: searchQuery}});
  const discoverUrl = eventView.getResultsViewUrlTarget(
    organization.slug,
    false,
    hasDatasetSelector(organization) ? SavedQueryDatasets.ERRORS : undefined
  );
  const chartZoomProps = useChartZoom({
    saveOnZoom: true,
  });

  const flagSeries = useFlagSeries({
    query: {
      start: eventView.start,
      end: eventView.end,
      statsPeriod: eventView.statsPeriod,
    },
  });

  const series = useMemo((): BarChartSeries[] => {
    const seriesData: BarChartSeries[] = [];

    if (eventStats && visibleSeries === EventGraphSeries.USER) {
      seriesData.push({
        seriesName: t('Users'),
        itemStyle: {
          borderRadius: [2, 2, 0, 0],
          borderColor: theme.translucentGray200,
          color: theme.purple200,
        },
        stack: 'stats',
        data: userSeries,
      });
    }
    if (eventStats && visibleSeries === EventGraphSeries.EVENT) {
      seriesData.push({
        seriesName: t('Events'),
        itemStyle: {
          borderRadius: [2, 2, 0, 0],
          borderColor: theme.translucentGray200,
          color: theme.gray200,
        },
        stack: 'stats',
        data: eventSeries,
      });
    }

    if (flagSeries.markLine) {
      seriesData.push(flagSeries as BarChartSeries);
    }

    return seriesData;
  }, [eventStats, visibleSeries, userSeries, eventSeries, flagSeries, theme]);

  const [legendSelected, setLegendSelected] = useState({
    ['Feature Flags']: true,
  });

  const legend = Legend({
    theme: theme,
    icon: 'path://M 10 10 H 500 V 9000 H 10 L 10 10',
    orient: 'horizontal',
    align: 'left',
    show: true,
    right: 35,
    top: 5,
    data: ['Feature Flags'],
    selected: legendSelected,
  });

  const onLegendSelectChanged = useMemo(
    () =>
      ({name, selected: record}) => {
        const newValue = record[name];
        setLegendSelected(prevState => ({
          ...prevState,
          [name]: newValue,
        }));
      },
    []
  );

  return (
    <GraphWrapper>
      <SummaryContainer>
        <Callout
          onClick={() =>
            visibleSeries === EventGraphSeries.USER &&
            setVisibleSeries(EventGraphSeries.EVENT)
          }
          isActive={visibleSeries === EventGraphSeries.EVENT}
          disabled={visibleSeries === EventGraphSeries.EVENT}
        >
          <InteractionStateLayer hidden={visibleSeries === EventGraphSeries.EVENT} />
          <Label>{tn('Event', 'Events', eventCount)}</Label>
          <Count>{formatAbbreviatedNumber(eventCount)}</Count>
        </Callout>
        <Callout
          onClick={() =>
            visibleSeries === EventGraphSeries.EVENT &&
            setVisibleSeries(EventGraphSeries.USER)
          }
          isActive={visibleSeries === EventGraphSeries.USER}
          disabled={visibleSeries === EventGraphSeries.USER}
        >
          <InteractionStateLayer hidden={visibleSeries === EventGraphSeries.USER} />
          <Label>{tn('User', 'Users', userCount)}</Label>
          <Count>{formatAbbreviatedNumber(userCount)}</Count>
        </Callout>
      </SummaryContainer>
      <ChartContainer
        role="figure"
        onMouseEnter={() => setIsGraphHovered(true)}
        onMouseLeave={() => setIsGraphHovered(false)}
      >
        <BarChart
          height={100}
          series={series}
          legend={legend}
          onLegendSelectChanged={onLegendSelectChanged}
          showTimeInTooltip
          grid={{
            top: 28, // leave room for legend
            left: 8,
            right: 8,
            bottom: 0,
          }}
          yAxis={{
            splitNumber: 2,
            axisLabel: {
              formatter: (value: number) => {
                return formatAbbreviatedNumber(value);
              },
            },
          }}
          {...chartZoomProps}
        />
        {discoverUrl && isGraphHovered && (
          <OpenInDiscoverButton>
            <LinkButton
              size="xs"
              icon={<IconTelescope />}
              to={discoverUrl}
              aria-label={t('Open in Discover')}
              title={t('Open in Discover')}
            />
          </OpenInDiscoverButton>
        )}
      </ChartContainer>
    </GraphWrapper>
  );
}

const GraphWrapper = styled('div')`
  display: grid;
  grid-template-columns: auto 1fr;
`;

const SummaryContainer = styled('div')`
  display: flex;
  flex-direction: column;
  margin-right: space(1);
  border-radius: ${p => p.theme.borderRadiusLeft};
`;

const Callout = styled('button')<{isActive: boolean}>`
  flex: 1;
  cursor: ${p => (p.isActive ? 'initial' : 'pointer')};
  outline: 0;
  position: relative;
  border: 1px solid ${p => p.theme.translucentInnerBorder};
  background: ${p => (p.isActive ? p.theme.background : p.theme.backgroundSecondary)};
  text-align: left;
  padding: ${space(1)} ${space(2)};
  &:first-child {
    border-radius: ${p => p.theme.borderRadius} 0 ${p => p.theme.borderRadius} 0;
    border-width: ${p => (p.isActive ? '0' : '0 1px 1px 0')};
  }
  &:last-child {
    border-radius: 0 ${p => p.theme.borderRadius} 0 ${p => p.theme.borderRadius};
    border-width: ${p => (p.isActive ? '0' : '1px 1px 0 0')};
  }
`;

const Label = styled('div')`
  font-size: ${p => p.theme.fontSizeSmall};
  color: ${p => p.theme.subText};
  font-weight: ${p => p.theme.fontWeightBold};
  line-height: 1;
`;

const Count = styled('div')`
  font-size: ${p => p.theme.headerFontSize};
  margin-top: ${space(0.5)};
  line-height: 1;
`;

const ChartContainer = styled('div')`
  padding: ${space(0.75)} ${space(1)} ${space(0.75)} 0;
  position: relative;
`;

const OpenInDiscoverButton = styled('div')`
  position: absolute;
  top: ${space(1)};
  right: ${space(1)};
`;
