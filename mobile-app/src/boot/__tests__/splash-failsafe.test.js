/* eslint-env jest */
// The failsafe's contract: arm an 8s timer BEFORE any require so a broken
// module graph cannot disarm it, then hide the splash via the smallest
// available path. These tests pin that contract — the file otherwise has no
// CI coverage (tsc skips .js, and the NODE_ENV guard skips the timer in
// normal test imports).

describe("boot/splash-failsafe", () => {
  const realNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = realNodeEnv;
    jest.useRealTimers();
    jest.resetModules();
    jest.dontMock("expo-modules-core");
    jest.dontMock("expo-splash-screen");
  });

  function loadFailsafe({ nativeModule, splashScreenMock }) {
    jest.resetModules();
    jest.doMock("expo-modules-core", () => ({
      __esModule: true,
      requireOptionalNativeModule: jest.fn(() => nativeModule),
    }));
    if (splashScreenMock) {
      jest.doMock("expo-splash-screen", () => splashScreenMock);
    }
    require("../splash-failsafe");
  }

  it("does not arm the timer under NODE_ENV=test", () => {
    jest.useFakeTimers();
    process.env.NODE_ENV = "test";
    loadFailsafe({ nativeModule: null });
    expect(jest.getTimerCount()).toBe(0);
  });

  it("arms an 8s timer and hides via the native module without loading expo-splash-screen", () => {
    jest.useFakeTimers();
    process.env.NODE_ENV = "production";
    const hide = jest.fn();
    loadFailsafe({ nativeModule: { hide } });

    expect(jest.getTimerCount()).toBe(1);
    expect(hide).not.toHaveBeenCalled();
    jest.advanceTimersByTime(8000);
    expect(hide).toHaveBeenCalledTimes(1);
  });

  it("falls back to expo-splash-screen.hideAsync when the native module is absent", () => {
    jest.useFakeTimers();
    process.env.NODE_ENV = "production";
    const hideAsync = jest.fn(() => Promise.resolve());
    loadFailsafe({
      nativeModule: null,
      splashScreenMock: { __esModule: true, hideAsync },
    });

    jest.advanceTimersByTime(8000);
    expect(hideAsync).toHaveBeenCalledTimes(1);
  });

  it("survives every module being broken without throwing", () => {
    jest.useFakeTimers();
    process.env.NODE_ENV = "production";
    jest.resetModules();
    jest.doMock("expo-modules-core", () => {
      throw new Error("boom: core graph is broken");
    });
    jest.doMock("expo-splash-screen", () => {
      throw new Error("boom: splash module is broken");
    });

    expect(() => {
      require("../splash-failsafe");
      jest.advanceTimersByTime(8000);
    }).not.toThrow();
  });
});
