import type { AppStartListening } from "./types.ts";
import {
  addAddresses,
  createDataset,
  deleteDataset,
  putContent,
  removeAddress,
  updateDataset,
} from "./thunks/datasets.ts";
import {
  createIpProfile,
  deleteIpProfile,
  updateIpProfile,
} from "./thunks/ip-profiles.ts";
import {
  createRuleFile,
  deleteRuleFile,
  updateRuleFile,
} from "./thunks/rule-files.ts";
import {
  createRuleSet,
  deleteRuleSet,
  updateRuleSet,
} from "./thunks/rule-sets.ts";
import {
  createInspector,
  updateInspector,
} from "./thunks/inspectors.ts";
import {
  createLocation,
  deleteLocation,
  updateLocation,
} from "./thunks/locations.ts";
import {
  bindCertificate,
  unbindCertificate,
} from "./thunks/certificates.ts";
import {
  bindPort,
  createPort,
  deletePort,
  unbindPort,
  updatePort,
  updatePortBind,
} from "./thunks/ports.ts";
import { createServer, deleteServer, updateServer } from "./thunks/servers.ts";
import { updateSpace } from "./thunks/spaces.ts";
import {
  createUpstream,
  deleteUpstream,
  updateUpstream,
} from "./thunks/upstreams.ts";
import { hydrateModel } from "./hydrate.ts";

export function attachListeners(start: AppStartListening): void {
  start({
    actionCreator: hydrateModel.fulfilled,
    effect: (_action, { extra }) => {
      extra.bus.hydrated();
    },
  });

  start({
    actionCreator: createDataset.fulfilled,
    effect: (action, { extra }) => {
      if (action.payload.kind === "list") {
        extra.bus.datasetChanged({
          op: "upsert",
          spaceId: action.payload.httpSpaceId,
          dataset: action.payload,
        });
      }
      extra.bus.draftChanged({
        spaceId: action.payload.httpSpaceId,
        reason: "dataset.upsert",
      });
    },
  });

  start({
    actionCreator: updateDataset.fulfilled,
    effect: (action, { extra }) => {
      if (action.payload.kind === "list") {
        extra.bus.datasetChanged({
          op: "upsert",
          spaceId: action.payload.httpSpaceId,
          dataset: action.payload,
        });
      }
      extra.bus.draftChanged({
        spaceId: action.payload.httpSpaceId,
        reason: "dataset.upsert",
      });
    },
  });

  start({
    actionCreator: putContent.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.dataset.httpSpaceId,
        reason: "dataset.content",
      });
    },
  });

  start({
    actionCreator: deleteDataset.fulfilled,
    effect: (action, { extra }) => {
      if (action.payload.kind === "list") {
        extra.bus.datasetChanged({
          op: "delete",
          spaceId: action.payload.httpSpaceId,
          dataset: action.payload,
        });
      }
      extra.bus.draftChanged({
        spaceId: action.payload.httpSpaceId,
        reason: "dataset.delete",
      });
    },
  });

  start({
    actionCreator: addAddresses.fulfilled,
    effect: (action, { extra }) => {
      if (!action.payload.dataset.active) {
        extra.bus.draftChanged({
          spaceId: action.payload.dataset.httpSpaceId,
          reason: "dataset.entries",
        });
      }
    },
  });

  start({
    actionCreator: removeAddress.fulfilled,
    effect: (action, { extra }) => {
      if (!action.payload.dataset.active) {
        extra.bus.draftChanged({
          spaceId: action.payload.dataset.httpSpaceId,
          reason: "dataset.entries",
        });
      }
    },
  });

  start({
    actionCreator: createRuleFile.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.httpSpaceId,
        reason: "rule_file.upsert",
      });
    },
  });

  start({
    actionCreator: updateRuleFile.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.httpSpaceId,
        reason: "rule_file.upsert",
      });
    },
  });

  start({
    actionCreator: deleteRuleFile.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.httpSpaceId,
        reason: "rule_file.delete",
      });
    },
  });

  start({
    actionCreator: createInspector.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.httpSpaceId,
        reason: "inspector.upsert",
      });
    },
  });

  start({
    actionCreator: updateInspector.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.httpSpaceId,
        reason: "inspector.upsert",
      });
    },
  });

  start({
    actionCreator: createRuleSet.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.httpSpaceId,
        reason: "rule_set.upsert",
      });
    },
  });

  start({
    actionCreator: updateRuleSet.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.httpSpaceId,
        reason: "rule_set.upsert",
      });
    },
  });

  start({
    actionCreator: deleteRuleSet.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.httpSpaceId,
        reason: "rule_set.delete",
      });
    },
  });

  start({
    actionCreator: createIpProfile.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.httpSpaceId,
        reason: "ip_profile.upsert",
      });
    },
  });

  start({
    actionCreator: updateIpProfile.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.httpSpaceId,
        reason: "ip_profile.upsert",
      });
    },
  });

  start({
    actionCreator: deleteIpProfile.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.httpSpaceId,
        reason: "ip_profile.delete",
      });
    },
  });

  start({
    actionCreator: updateSpace.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.id,
        reason: "space.http",
      });
    },
  });

  start({
    actionCreator: createServer.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.server.httpSpaceId,
        reason: "server.upsert",
      });
    },
  });

  start({
    actionCreator: updateServer.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.httpSpaceId,
        reason: "server.upsert",
      });
    },
  });

  start({
    actionCreator: deleteServer.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.httpSpaceId,
        reason: "server.delete",
      });
    },
  });

  start({
    actionCreator: createLocation.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.httpSpaceId,
        reason: "location.upsert",
      });
    },
  });

  start({
    actionCreator: updateLocation.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.httpSpaceId,
        reason: "location.upsert",
      });
    },
  });

  start({
    actionCreator: deleteLocation.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.httpSpaceId,
        reason: "location.delete",
      });
    },
  });

  start({
    actionCreator: createPort.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.httpSpaceId,
        reason: "port.upsert",
      });
    },
  });

  start({
    actionCreator: updatePort.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.httpSpaceId,
        reason: "port.upsert",
      });
    },
  });

  start({
    actionCreator: deletePort.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.httpSpaceId,
        reason: "port.delete",
      });
    },
  });

  start({
    actionCreator: bindPort.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.port.httpSpaceId,
        reason: "port.bind",
      });
    },
  });

  start({
    actionCreator: updatePortBind.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.port.httpSpaceId,
        reason: "port.bind",
      });
    },
  });

  start({
    actionCreator: unbindPort.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.port.httpSpaceId,
        reason: "port.unbind",
      });
    },
  });

  start({
    actionCreator: bindCertificate.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.certificate.httpSpaceId,
        reason: "certificate.bind",
      });
    },
  });

  start({
    actionCreator: unbindCertificate.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.certificate.httpSpaceId,
        reason: "certificate.unbind",
      });
    },
  });

  start({
    actionCreator: createUpstream.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.httpSpaceId,
        reason: "upstream.upsert",
      });
    },
  });

  start({
    actionCreator: updateUpstream.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.httpSpaceId,
        reason: "upstream.upsert",
      });
    },
  });

  start({
    actionCreator: deleteUpstream.fulfilled,
    effect: (action, { extra }) => {
      extra.bus.draftChanged({
        spaceId: action.payload.httpSpaceId,
        reason: "upstream.delete",
      });
    },
  });
}
