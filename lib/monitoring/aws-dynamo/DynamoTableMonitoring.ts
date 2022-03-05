import {
  Column,
  GraphWidget,
  HorizontalAnnotation,
  IMetric,
  IWidget,
  LegendPosition,
} from "monocdk/aws-cloudwatch";
import { CfnTable, ITable, Operation } from "monocdk/aws-dynamodb";

import {
  AlarmFactory,
  BaseMonitoringProps,
  CapacityType,
  ConsumedCapacityThreshold,
  CountAxisFromZero,
  DefaultSummaryWidgetHeight,
  DefaultTwoLinerGraphWidgetHalfHeight,
  DefaultTwoLinerGraphWidgetHeight,
  DynamoAlarmFactory,
  ErrorAlarmFactory,
  ErrorCountThreshold,
  ErrorType,
  HalfQuarterWidth,
  HalfWidth,
  LatencyAlarmFactory,
  LatencyThreshold,
  LatencyType,
  MetricWithAlarmSupport,
  Monitoring,
  MonitoringScope,
  PercentageAxisFromZeroToHundred,
  QuarterWidth,
  ThrottledEventsThreshold,
  TimeAxisMillisFromZero,
} from "../../common";
import {
  MonitoringHeaderWidget,
  MonitoringNamingStrategy,
} from "../../dashboard";
import {
  DynamoTableMetricFactory,
  DynamoTableMetricFactoryProps,
} from "./DynamoTableMetricFactory";

export interface DynamoTableMonitoringOptions extends BaseMonitoringProps {
  readonly addConsumedReadCapacityAlarm?: Record<
    string,
    ConsumedCapacityThreshold
  >;
  readonly addConsumedWriteCapacityAlarm?: Record<
    string,
    ConsumedCapacityThreshold
  >;
  readonly addReadThrottledEventsCountAlarm?: Record<
    string,
    ThrottledEventsThreshold
  >;
  readonly addWriteThrottledEventsCountAlarm?: Record<
    string,
    ThrottledEventsThreshold
  >;
  readonly addSystemErrorCountAlarm?: Record<string, ErrorCountThreshold>;
  readonly addAverageSuccessfulGetRecordsLatencyAlarm?: Record<
    string,
    LatencyThreshold
  >;
  readonly addAverageSuccessfulQueryLatencyAlarm?: Record<
    string,
    LatencyThreshold
  >;
  readonly addAverageSuccessfulScanLatencyAlarm?: Record<
    string,
    LatencyThreshold
  >;
  readonly addAverageSuccessfulPutItemLatencyAlarm?: Record<
    string,
    LatencyThreshold
  >;
  readonly addAverageSuccessfulGetItemLatencyAlarm?: Record<
    string,
    LatencyThreshold
  >;
  readonly addAverageSuccessfulUpdateItemLatencyAlarm?: Record<
    string,
    LatencyThreshold
  >;
  readonly addAverageSuccessfulDeleteItemLatencyAlarm?: Record<
    string,
    LatencyThreshold
  >;
  readonly addAverageSuccessfulBatchGetItemLatencyAlarm?: Record<
    string,
    LatencyThreshold
  >;
  readonly addAverageSuccessfulBatchWriteItemLatencyAlarm?: Record<
    string,
    LatencyThreshold
  >;
}

export interface DynamoTableMonitoringProps
  extends DynamoTableMetricFactoryProps,
    DynamoTableMonitoringOptions {}

export class DynamoTableMonitoring extends Monitoring {
  protected readonly title: string;
  protected readonly tableUrl?: string;

  protected readonly alarmFactory: AlarmFactory;
  protected readonly errorAlarmFactory: ErrorAlarmFactory;
  protected readonly latencyAlarmFactory: LatencyAlarmFactory;
  protected readonly dynamoCapacityAlarmFactory: DynamoAlarmFactory;

  protected readonly latencyAnnotations: HorizontalAnnotation[];
  protected readonly errorCountAnnotations: HorizontalAnnotation[];
  protected readonly dynamoReadCapacityAnnotations: HorizontalAnnotation[];
  protected readonly dynamoWriteCapacityAnnotations: HorizontalAnnotation[];
  protected readonly throttledEventsAnnotations: HorizontalAnnotation[];

  protected readonly provisionedReadUnitsMetric: MetricWithAlarmSupport;
  protected readonly provisionedWriteUnitsMetric: MetricWithAlarmSupport;
  protected readonly consumedReadUnitsMetric: MetricWithAlarmSupport;
  protected readonly consumedWriteUnitsMetric: MetricWithAlarmSupport;
  protected readonly readThrottleCountMetric: MetricWithAlarmSupport;
  protected readonly writeThrottleCountMetric: MetricWithAlarmSupport;
  protected readonly systemErrorMetric: MetricWithAlarmSupport;
  protected readonly latencyAverageSearchMetrics: IMetric;
  // keys are Operation, but JSII doesn't like non-string types
  protected readonly averagePerOperationLatencyMetrics: Record<
    string,
    MetricWithAlarmSupport
  >;
  protected readonly readCapacityUsageMetric: MetricWithAlarmSupport;
  protected readonly writeCapacityUsageMetric: MetricWithAlarmSupport;

  constructor(scope: MonitoringScope, props: DynamoTableMonitoringProps) {
    super(scope, props);

    const namingStrategy = new MonitoringNamingStrategy({
      ...props,
      namedConstruct: props.table,
      fallbackConstructName: this.resolveTableName(props.table),
    });

    this.title = namingStrategy.resolveHumanReadableName();
    this.tableUrl = scope
      .createAwsConsoleUrlFactory()
      .getDynamoTableUrl(props.table.tableName);

    this.alarmFactory = this.createAlarmFactory(
      namingStrategy.resolveAlarmFriendlyName()
    );
    this.errorAlarmFactory = new ErrorAlarmFactory(this.alarmFactory);
    this.latencyAlarmFactory = new LatencyAlarmFactory(this.alarmFactory);
    this.dynamoCapacityAlarmFactory = new DynamoAlarmFactory(this.alarmFactory);
    this.errorCountAnnotations = [];
    this.latencyAnnotations = [];
    this.dynamoReadCapacityAnnotations = [];
    this.dynamoWriteCapacityAnnotations = [];
    this.throttledEventsAnnotations = [];

    const metricFactory = new DynamoTableMetricFactory(
      scope.createMetricFactory(),
      props
    );
    this.provisionedReadUnitsMetric =
      metricFactory.metricProvisionedReadCapacityUnits();
    this.provisionedWriteUnitsMetric =
      metricFactory.metricProvisionedWriteCapacityUnits();
    this.consumedReadUnitsMetric =
      metricFactory.metricConsumedReadCapacityUnits();
    this.consumedWriteUnitsMetric =
      metricFactory.metricConsumedWriteCapacityUnits();
    this.readThrottleCountMetric =
      metricFactory.metricThrottledReadRequestCount();
    this.writeThrottleCountMetric =
      metricFactory.metricThrottledWriteRequestCount();
    this.systemErrorMetric = metricFactory.metricSystemErrorsCount();
    this.latencyAverageSearchMetrics =
      metricFactory.metricSearchAverageSuccessfulRequestLatencyInMillis();
    this.averagePerOperationLatencyMetrics = {
      [Operation.GET_RECORDS]:
        metricFactory.metricAverageSuccessfulRequestLatencyInMillis(
          Operation.GET_RECORDS
        ),
      [Operation.QUERY]:
        metricFactory.metricAverageSuccessfulRequestLatencyInMillis(
          Operation.QUERY
        ),
      [Operation.SCAN]:
        metricFactory.metricAverageSuccessfulRequestLatencyInMillis(
          Operation.SCAN
        ),
      [Operation.PUT_ITEM]:
        metricFactory.metricAverageSuccessfulRequestLatencyInMillis(
          Operation.PUT_ITEM
        ),
      [Operation.GET_ITEM]:
        metricFactory.metricAverageSuccessfulRequestLatencyInMillis(
          Operation.GET_ITEM
        ),
      [Operation.UPDATE_ITEM]:
        metricFactory.metricAverageSuccessfulRequestLatencyInMillis(
          Operation.UPDATE_ITEM
        ),
      [Operation.DELETE_ITEM]:
        metricFactory.metricAverageSuccessfulRequestLatencyInMillis(
          Operation.DELETE_ITEM
        ),
      [Operation.BATCH_GET_ITEM]:
        metricFactory.metricAverageSuccessfulRequestLatencyInMillis(
          Operation.BATCH_GET_ITEM
        ),
      [Operation.BATCH_WRITE_ITEM]:
        metricFactory.metricAverageSuccessfulRequestLatencyInMillis(
          Operation.BATCH_WRITE_ITEM
        ),
    };
    this.readCapacityUsageMetric =
      metricFactory.metricReadCapacityUtilizationPercentage();
    this.writeCapacityUsageMetric =
      metricFactory.metricWriteCapacityUtilizationPercentage();

    for (const disambiguator in props.addConsumedReadCapacityAlarm) {
      const alarmProps = props.addConsumedReadCapacityAlarm[disambiguator];
      const createdAlarm =
        this.dynamoCapacityAlarmFactory.addConsumedCapacityAlarm(
          this.consumedReadUnitsMetric,
          CapacityType.READ,
          alarmProps,
          disambiguator
        );
      this.dynamoReadCapacityAnnotations.push(createdAlarm.annotation);
      this.addAlarm(createdAlarm);
    }
    for (const disambiguator in props.addConsumedWriteCapacityAlarm) {
      const alarmProps = props.addConsumedWriteCapacityAlarm[disambiguator];
      const createdAlarm =
        this.dynamoCapacityAlarmFactory.addConsumedCapacityAlarm(
          this.consumedWriteUnitsMetric,
          CapacityType.WRITE,
          alarmProps,
          disambiguator
        );
      this.dynamoWriteCapacityAnnotations.push(createdAlarm.annotation);
      this.addAlarm(createdAlarm);
    }
    for (const disambiguator in props.addReadThrottledEventsCountAlarm) {
      const alarmProps = props.addReadThrottledEventsCountAlarm[disambiguator];
      const createdAlarm =
        this.dynamoCapacityAlarmFactory.addThrottledEventsAlarm(
          this.readThrottleCountMetric,
          CapacityType.READ,
          alarmProps,
          disambiguator
        );
      this.throttledEventsAnnotations.push(createdAlarm.annotation);
      this.addAlarm(createdAlarm);
    }
    for (const disambiguator in props.addWriteThrottledEventsCountAlarm) {
      const alarmProps = props.addWriteThrottledEventsCountAlarm[disambiguator];
      const createdAlarm =
        this.dynamoCapacityAlarmFactory.addThrottledEventsAlarm(
          this.writeThrottleCountMetric,
          CapacityType.WRITE,
          alarmProps,
          disambiguator
        );
      this.throttledEventsAnnotations.push(createdAlarm.annotation);
      this.addAlarm(createdAlarm);
    }
    for (const disambiguator in props.addSystemErrorCountAlarm) {
      const alarmProps = props.addSystemErrorCountAlarm[disambiguator];
      const createdAlarm = this.errorAlarmFactory.addErrorCountAlarm(
        this.systemErrorMetric,
        ErrorType.SYSTEM_ERROR,
        alarmProps,
        disambiguator
      );
      this.errorCountAnnotations.push(createdAlarm.annotation);
      this.addAlarm(createdAlarm);
    }
    this.forEachOperationLatencyAlarmDefinition(
      Operation.GET_RECORDS,
      props.addAverageSuccessfulGetRecordsLatencyAlarm
    );
    this.forEachOperationLatencyAlarmDefinition(
      Operation.QUERY,
      props.addAverageSuccessfulQueryLatencyAlarm
    );
    this.forEachOperationLatencyAlarmDefinition(
      Operation.SCAN,
      props.addAverageSuccessfulScanLatencyAlarm
    );
    this.forEachOperationLatencyAlarmDefinition(
      Operation.PUT_ITEM,
      props.addAverageSuccessfulPutItemLatencyAlarm
    );
    this.forEachOperationLatencyAlarmDefinition(
      Operation.GET_ITEM,
      props.addAverageSuccessfulGetItemLatencyAlarm
    );
    this.forEachOperationLatencyAlarmDefinition(
      Operation.UPDATE_ITEM,
      props.addAverageSuccessfulUpdateItemLatencyAlarm
    );
    this.forEachOperationLatencyAlarmDefinition(
      Operation.DELETE_ITEM,
      props.addAverageSuccessfulDeleteItemLatencyAlarm
    );
    this.forEachOperationLatencyAlarmDefinition(
      Operation.BATCH_GET_ITEM,
      props.addAverageSuccessfulBatchGetItemLatencyAlarm
    );
    this.forEachOperationLatencyAlarmDefinition(
      Operation.BATCH_WRITE_ITEM,
      props.addAverageSuccessfulBatchWriteItemLatencyAlarm
    );
    props.useCreatedAlarms?.consume(this.createdAlarms());
  }

  protected forEachOperationLatencyAlarmDefinition(
    operation: Operation,
    alarm?: Record<string, LatencyThreshold>
  ) {
    for (const disambiguator in alarm) {
      const alarmProps = alarm[disambiguator];
      const createdAlarm = this.latencyAlarmFactory.addLatencyAlarm(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.averagePerOperationLatencyMetrics[operation]!,
        LatencyType.AVERAGE,
        alarmProps,
        operation + "-" + disambiguator
      );
      this.latencyAnnotations.push(createdAlarm.annotation);
      this.addAlarm(createdAlarm);
    }
  }

  summaryWidgets(): IWidget[] {
    return [
      // Title
      this.createTitleWidget(),
      // Read units
      this.createReadCapacityWidget(HalfWidth, DefaultSummaryWidgetHeight),
      // Write units
      this.createWriteCapacityWidget(HalfWidth, DefaultSummaryWidgetHeight),
    ];
  }

  widgets(): IWidget[] {
    return [
      // Title
      this.createTitleWidget(),
      new Column(
        // Read units
        this.createReadCapacityWidget(
          QuarterWidth,
          DefaultTwoLinerGraphWidgetHalfHeight
        ),
        // Write units
        this.createWriteCapacityWidget(
          QuarterWidth,
          DefaultTwoLinerGraphWidgetHalfHeight
        )
      ),
      // Latency
      this.createLatencyWidget(
        QuarterWidth + HalfQuarterWidth,
        DefaultTwoLinerGraphWidgetHeight
      ),
      // Throttles
      this.createThrottlesWidget(
        HalfQuarterWidth,
        DefaultTwoLinerGraphWidgetHeight
      ),
      // Errors
      this.createErrorsWidget(QuarterWidth, DefaultTwoLinerGraphWidgetHeight),
    ];
  }

  protected createLatencyWidget(width: number, height: number) {
    return new GraphWidget({
      width,
      height,
      title: "Latency (Average)",
      left: [this.latencyAverageSearchMetrics],
      leftYAxis: TimeAxisMillisFromZero,
      leftAnnotations: this.latencyAnnotations,
      legendPosition: LegendPosition.RIGHT,
    });
  }

  protected createThrottlesWidget(width: number, height: number) {
    return new GraphWidget({
      width,
      height,
      title: "Throttles",
      left: [this.readThrottleCountMetric, this.writeThrottleCountMetric],
      leftYAxis: CountAxisFromZero,
      leftAnnotations: this.throttledEventsAnnotations,
    });
  }

  protected createErrorsWidget(width: number, height: number) {
    return new GraphWidget({
      width,
      height,
      title: "Errors",
      left: [this.systemErrorMetric],
      leftYAxis: CountAxisFromZero,
      leftAnnotations: this.errorCountAnnotations,
    });
  }

  protected createReadCapacityWidget(width: number, height: number) {
    return new GraphWidget({
      width,
      height,
      title: "Read Usage",
      left: [this.consumedReadUnitsMetric, this.provisionedReadUnitsMetric],
      leftYAxis: CountAxisFromZero,
      leftAnnotations: this.dynamoReadCapacityAnnotations,
      right: [this.readCapacityUsageMetric],
      rightYAxis: PercentageAxisFromZeroToHundred,
      legendPosition: LegendPosition.RIGHT,
    });
  }

  protected createWriteCapacityWidget(width: number, height: number) {
    return new GraphWidget({
      width,
      height,
      title: "Write Usage",
      left: [this.consumedWriteUnitsMetric, this.provisionedWriteUnitsMetric],
      leftYAxis: CountAxisFromZero,
      leftAnnotations: this.dynamoWriteCapacityAnnotations,
      right: [this.writeCapacityUsageMetric],
      rightYAxis: PercentageAxisFromZeroToHundred,
      legendPosition: LegendPosition.RIGHT,
    });
  }

  protected createTitleWidget() {
    return new MonitoringHeaderWidget({
      family: "Dynamo Table",
      title: this.title,
      goToLinkUrl: this.tableUrl,
    });
  }

  private resolveTableName(dynamoTable: ITable): string | undefined {
    // try to take the name (if specified) instead of token
    return (dynamoTable.node.defaultChild as CfnTable)?.tableName;
  }
}
