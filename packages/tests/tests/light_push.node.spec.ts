import { createEncoder, waitForRemotePeer } from "@waku/core";
import { createLightNode } from "@waku/create";
import { LightNode, SendError } from "@waku/interfaces";
import { Protocols } from "@waku/interfaces";
import { utf8ToBytes } from "@waku/utils/bytes";
import { expect } from "chai";
import debug from "debug";

import {
  base64ToUtf8,
  delay,
  makeLogFileName,
  NimGoNode,
  NOISE_KEY_1,
} from "../src/index.js";
import { MessageRpcResponse } from "../src/node/interfaces.js";
import { generateRandomUint8Array } from "../src/random_array.js";

const log = debug("waku:test:lightpush");

const TestContentTopic = "/test/1/waku-light-push/utf8";
const TestEncoder = createEncoder({
  contentTopic: TestContentTopic,
});

describe("Waku Light Push [node only]", () => {
  let waku: LightNode;
  let nwaku: NimGoNode;

  const runNodes = async (
    context: Mocha.Context,
    pubSubTopic?: string
  ): Promise<void> => {
    const nwakuOptional = pubSubTopic ? { topics: pubSubTopic } : {};
    nwaku = new NimGoNode(makeLogFileName(context));
    await nwaku.start({
      lightpush: true,
      relay: true,
      ...nwakuOptional,
    });

    waku = await createLightNode({
      pubSubTopic,
      staticNoiseKey: NOISE_KEY_1,
    });
    await waku.start();
    await waku.dial(await nwaku.getMultiaddrWithId());
    await waitForRemotePeer(waku, [Protocols.LightPush]);
  };

  beforeEach(async function () {
    this.timeout(15_000);
    await runNodes(this);
  });

  afterEach(async function () {
    try {
      nwaku?.stop();
      waku?.stop();
    } catch (e) {
      console.error("Failed to stop nodes: ", e);
    }
  });

  it("Push successfully", async function () {
    this.timeout(15_000);

    const messageText = "Light Push works!";

    const pushResponse = await waku.lightPush.send(TestEncoder, {
      payload: utf8ToBytes(messageText),
    });
    expect(pushResponse.recipients.length).to.eq(1);

    let msgs: MessageRpcResponse[] = [];

    while (msgs.length === 0) {
      await delay(200);
      msgs = await nwaku.messages();
    }

    expect(msgs[0].contentTopic).to.equal(TestContentTopic);
    expect(base64ToUtf8(msgs[0].payload)).to.equal(messageText);
  });

  it("Pushes messages equal or less that 1MB", async function () {
    this.timeout(15_000);
    const MB = 1024 ** 2;

    let pushResponse = await waku.lightPush.send(TestEncoder, {
      payload: generateRandomUint8Array(MB),
    });
    expect(pushResponse.recipients.length).to.greaterThan(0);

    pushResponse = await waku.lightPush.send(TestEncoder, {
      payload: generateRandomUint8Array(65536),
    });
    expect(pushResponse.recipients.length).to.greaterThan(0);
  });

  it("Fails to push message bigger that 1MB", async function () {
    this.timeout(15_000);
    const MB = 1024 ** 2;

    const pushResponse = await waku.lightPush.send(TestEncoder, {
      payload: generateRandomUint8Array(MB + 65536),
    });
    expect(pushResponse.recipients.length).to.eq(0);
    expect(pushResponse.error).to.eq(SendError.SIZE_TOO_BIG);
  });

  it("Push on custom pubsub topic", async function () {
    this.timeout(15_000);

    const customPubSubTopic = "/waku/2/custom-dapp/proto";
    await runNodes(this, customPubSubTopic);

    const nimPeerId = await nwaku.getPeerId();
    const messageText = "Light Push works!";

    log("Send message via lightpush");
    const pushResponse = await waku.lightPush.send(
      TestEncoder,
      { payload: utf8ToBytes(messageText) },
      {
        peerId: nimPeerId,
      }
    );
    log("Ack received", pushResponse);
    expect(pushResponse.recipients[0].toString()).to.eq(nimPeerId.toString());

    let msgs: MessageRpcResponse[] = [];

    log("Waiting for message to show in nwaku");
    while (msgs.length === 0) {
      await delay(200);
      msgs = await nwaku.messages(customPubSubTopic);
    }

    expect(msgs[0].contentTopic).to.equal(TestContentTopic);
    expect(base64ToUtf8(msgs[0].payload)).to.equal(messageText);
  });
});
