import { Injectable, Logger } from '@nestjs/common';
import cluster from 'node:cluster';
import * as os from 'node:os';

// Define main function type for cluster bootstrap
export type ClusterBootstrapFunction = (enableCluster: boolean | string, isPrimary: boolean) => void | Promise<void>;

@Injectable()
export class ClusterService {
    private static readonly logger = new Logger(ClusterService.name);

    /**
     * Start application in cluster mode or single process mode
     * @param bootstrap - The bootstrap function to run
     * @param options - Optional cluster configuration
     */
    static clusterize(
        bootstrap: ClusterBootstrapFunction,
        options?: {
            workers?: number;
            enable?: boolean | string;
        },
    ): void {
        const numberWorkers = options?.workers || Number(process.env.CLUSTER_WORKER ?? os.cpus().length);
        const enableCluster = options?.enable ?? process.env.CLUSTER_ENABLE ?? false;

        if (!enableCluster) {
            this.logger.debug(`Single server started on ${process.pid}`);
            bootstrap(false, false);
            return;
        }

        if (cluster.isPrimary) {
            bootstrap(enableCluster, true);
            this.logger.debug(`Primary server started on ${process.pid}, will start ${numberWorkers} workers`);

            for (let i = 0; i < numberWorkers; i++) {
                cluster.fork();
            }

            cluster.on('exit', (worker: { process: { pid: number } }, _code: number, _signal: string) => {
                this.logger.warn(`Worker ${worker.process.pid} died. Restarting`);
                cluster.fork();
            });
        } else {
            this.logger.debug(`Worker server started on ${process.pid}`);
            bootstrap(enableCluster, false);
        }
    }
}
