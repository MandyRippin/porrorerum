import {
  createDecoder,
  createEncoder,
  DecodedMessage,
  DefaultPubSubTopic,
  waitForRemotePeer,
} from "@waku/core";
import { createLightNode } from "@waku/create";
import type {
  IFilterV2,
  IFilterV2Subscription,
  LightNode,
} from "@waku/interfaces";
import { Protocols } from "@waku/interfaces";
import { bytesToUtf8, utf8ToBytes } from "@waku/utils/bytes";
import { expect } from "chai";
import debug from "debug";

import {
  delay,
  makeLogFileName,
  NimGoNode,
  NOISE_KEY_1,
} from "../src/index.js";

const log = debug("waku:test");

const TestContentTopic = "/test/1/waku-filter";
const TestEncoder = createEncoder({ contentTopic: TestContentTopic });
const TestDecoder = createDecoder(TestContentTopic);

describe("Waku Filter: V2", () => {
  let waku: LightNode;
  let nwaku: NimGoNode;

  let subscription: IFilterV2Subscription;

  afterEach(async function () {
    !!nwaku &&
      nwaku.stop().catch((e) => console.log("Nwaku failed to stop", e));
    !!waku && waku.stop().catch((e) => console.log("Waku failed to stop", e));
  });

  beforeEach(async function () {
    this.timeout(15000);
    nwaku = new NimGoNode(makeLogFileName(this));
    await nwaku.start({
      filter: true,
      lightpush: true,
      relay: true,
    });
    waku = await createLightNode({
      staticNoiseKey: NOISE_KEY_1,
      libp2p: { addresses: { listen: ["/ip4/0.0.0.0/tcp/0/ws"] } },
    });
    await waku.start();
    await waku.dial(await nwaku.getMultiaddrWithId());
    await waitForRemotePeer(waku, [Protocols.Filter, Protocols.LightPush]);
    subscription = await (waku.filter as IFilterV2).createSubscription();
  });

  it("creates a subscription", async function () {
    this.timeout(10000);

    let messageCount = 0;
    const messageText = "Filtering works!";
    const message = { payload: utf8ToBytes(messageText) };

    const callback = (msg: DecodedMessage): void => {
      log("Got a message");
      messageCount++;
      expect(msg.contentTopic).to.eq(TestContentTopic);
      expect(msg.pubSubTopic).to.eq(DefaultPubSubTopic);
      expect(bytesToUtf8(msg.payload)).to.eq(messageText);
    };

    await subscription.subscribe([TestDecoder], callback);

    await waku.lightPush.send(TestEncoder, message);
    while (messageCount === 0) {
      await delay(250);
    }
    expect(messageCount).to.eq(1);
  });

  it("modifies subscription", async function () {
    this.timeout(10000);

    let messageCount = 0;
    const messageText = "Filtering works!";
    const message = { payload: utf8ToBytes(messageText) };

    const callback = (msg: DecodedMessage): void => {
      log("Got a message");
      messageCount++;
      expect(msg.contentTopic).to.eq(TestContentTopic);
      expect(msg.pubSubTopic).to.eq(DefaultPubSubTopic);
      expect(bytesToUtf8(msg.payload)).to.eq(messageText);
    };

    await subscription.subscribe([TestDecoder], callback);

    await delay(200);

    await waku.lightPush.send(TestEncoder, message);
    while (messageCount === 0) {
      await delay(250);
    }
    expect(messageCount).to.eq(1);

    // Modify subscription
    messageCount = 0;
    const newMessageText = "Filtering still works!";
    const newMessage = { payload: utf8ToBytes(newMessageText) };

    const newContentTopic = "/test/2/waku-filter";
    const newEncoder = createEncoder({ contentTopic: newContentTopic });
    const newDecoder = createDecoder(newContentTopic);
    const newCallback = (msg: DecodedMessage): void => {
      log("Got a message");
      messageCount++;
      expect(msg.contentTopic).to.eq(newContentTopic);
      expect(msg.pubSubTopic).to.eq(DefaultPubSubTopic);
      expect(bytesToUtf8(msg.payload)).to.eq(newMessageText);
    };

    await subscription.subscribe([newDecoder], newCallback);

    await waku.lightPush.send(newEncoder, newMessage);
    while (messageCount === 0) {
      await delay(250);
    }
    expect(messageCount).to.eq(1);
  });

  it("handles multiple messages", async function () {
    this.timeout(10000);

    let messageCount = 0;
    const callback = (msg: DecodedMessage): void => {
      messageCount++;
      expect(msg.contentTopic).to.eq(TestContentTopic);
    };
    await subscription.subscribe(TestDecoder, callback);

    await waku.lightPush.send(TestEncoder, {
      payload: utf8ToBytes("Filtering works!"),
    });
    await waku.lightPush.send(TestEncoder, {
      payload: utf8ToBytes("Filtering still works!"),
    });
    while (messageCount < 2) {
      await delay(250);
    }
    expect(messageCount).to.eq(2);
  });

  it("unsubscribes", async function () {
    let messageCount = 0;
    const callback = (): void => {
      messageCount++;
    };
    await subscription.subscribe([TestDecoder], callback);

    await delay(200);
    await waku.lightPush.send(TestEncoder, {
      payload: utf8ToBytes("This should be received"),
    });
    await delay(100);
    await subscription.unsubscribe([TestContentTopic]);
    await waku.lightPush.send(TestEncoder, {
      payload: utf8ToBytes("This should not be received"),
    });
    await delay(100);
    expect(messageCount).to.eq(1);
  });

  it("ping", async function () {
    let messageCount = 0;
    const callback = (): void => {
      messageCount++;
    };
    await subscription.subscribe([TestDecoder], callback);

    await delay(200);
    await waku.lightPush.send(TestEncoder, {
      payload: utf8ToBytes("This should be received"),
    });
    await delay(100);
    await subscription.ping();
    await waku.lightPush.send(TestEncoder, {
      payload: utf8ToBytes("This should also be received"),
    });
    await delay(100);
    expect(messageCount).to.eq(2);
  });

  it("unsubscribes all", async function () {
    let messageCount = 0;
    const callback = (): void => {
      messageCount++;
    };
    await subscription.subscribe([TestDecoder], callback);

    await delay(200);
    await waku.lightPush.send(TestEncoder, {
      payload: utf8ToBytes("This should be received"),
    });
    await delay(100);
    await subscription.unsubscribeAll();
    await waku.lightPush.send(TestEncoder, {
      payload: utf8ToBytes("This should not be received"),
    });
    await delay(100);
    expect(messageCount).to.eq(1);
  });
});
