const { expect } = require("chai");
const { ethers } = require("hardhat");
require("@nomicfoundation/hardhat-chai-matchers");

const ONE_TOKEN = 10n ** 18n;
const ONE_ETHER = 10n ** 18n;
const DECIMALS_FACTOR = 10n ** 18n;

describe("GMCLandCompensation - Comprehensive Tests", function () {
  let GMCLandCompensation;
  let token;
  let owner, user1, user2, user3;

  beforeEach(async () => {
    [owner, user1, user2, user3] = await ethers.getSigners();

    GMCLandCompensation = await ethers.getContractFactory("GMCLandCompensation");
    token = await GMCLandCompensation.deploy(owner.address);
    await token.waitForDeployment();

    await token.setTokensPerUnit(ONE_TOKEN);
  });

  describe("Token Rate Configuration", () => {
    it("sets tokensPerUnit correctly", async () => {
      const rate = await token.tokensPerUnit();
      expect(rate).to.equal(ONE_TOKEN);
    });

    it("allows owner to update tokensPerUnit", async () => {
      const newRate = 2n * ONE_TOKEN;
      await expect(token.setTokensPerUnit(newRate))
        .to.emit(token, "TokensPerUnitUpdated")
        .withArgs(ONE_TOKEN, newRate);

      const rate = await token.tokensPerUnit();
      expect(rate).to.equal(newRate);
    });

    it("reverts when non-owner tries to set tokensPerUnit", async () => {
      await expect(
        token.connect(user1).setTokensPerUnit(2n * ONE_TOKEN)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("reverts when setting tokensPerUnit to zero", async () => {
      await expect(token.setTokensPerUnit(0)).to.be.revertedWith(
        "Rate must be > 0"
      );
    });
  });

  describe("Land Plot Registration", () => {
    it("registers land plot, mints tokens and tracks per-plot balance", async () => {
      const landValue = 5n;
      const expectedTokens = landValue * ONE_TOKEN;

      await expect(
        token.registerLandPlot(
          "GT1-0001",
          "Gelephu",
          "Gelephu Throm",
          "2583",
          "Sonia Ghalay",
          "12008000663",
          "Family Ownership",
          "Private",
          "Urban Core",
          "CLASS A",
          510n,
          landValue,
          user1.address
        )
      )
        .to.emit(token, "LandPlotRegistered")
        .withArgs("GT1-0001", user1.address, landValue, expectedTokens);

      const bal = await token.balanceOf(user1.address);
      expect(bal).to.equal(expectedTokens);

      const plot = await token.plots("GT1-0001");
      expect(plot.exists).to.equal(true);
      expect(plot.landValue).to.equal(landValue);
      expect(plot.allocatedTokens).to.equal(expectedTokens);
      expect(plot.wallet).to.equal(user1.address);
      expect(plot.ownerName).to.equal("Sonia Ghalay");

      const tokensFromPlot = await token.tokensFromPlot(
        user1.address,
        "GT1-0001"
      );
      expect(tokensFromPlot).to.equal(expectedTokens);

      const walletPlots = await token.walletPlots(user1.address, 0);
      expect(walletPlots).to.equal("GT1-0001");
    });

    it("reverts when registering duplicate plot", async () => {
      await token.registerLandPlot(
        "GT1-0001",
        "Gelephu",
        "Gelephu Throm",
        "2583",
        "Owner",
        "12008000663",
        "Family",
        "Private",
        "Urban Core",
        "CLASS A",
        510n,
        5n,
        user1.address
      );

      await expect(
        token.registerLandPlot(
          "GT1-0001",
          "Different",
          "Different",
          "9999",
          "Other",
          "99999999999",
          "Other",
          "Other",
          "Other",
          "CLASS B",
          100n,
          10n,
          user2.address
        )
      ).to.be.revertedWith("Plot already exists");
    });

    it("reverts when registering plot with zero address", async () => {
      await expect(
        token.registerLandPlot(
          "GT1-0001",
          "Gelephu",
          "Gelephu Throm",
          "2583",
          "Owner",
          "12008000663",
          "Family",
          "Private",
          "Urban Core",
          "CLASS A",
          510n,
          5n,
          ethers.ZeroAddress
        )
      ).to.be.revertedWith("Invalid wallet");
    });

    it("reverts when registering plot with zero land value", async () => {
      await expect(
        token.registerLandPlot(
          "GT1-0001",
          "Gelephu",
          "Gelephu Throm",
          "2583",
          "Owner",
          "12008000663",
          "Family",
          "Private",
          "Urban Core",
          "CLASS A",
          510n,
          0n,
          user1.address
        )
      ).to.be.revertedWith("Land value must be > 0");
    });

    it("reverts when tokensPerUnit is not set", async () => {
      const newToken = await GMCLandCompensation.deploy(owner.address);
      await newToken.waitForDeployment();

      await expect(
        newToken.registerLandPlot(
          "GT1-0001",
          "Gelephu",
          "Gelephu Throm",
          "2583",
          "Owner",
          "12008000663",
          "Family",
          "Private",
          "Urban Core",
          "CLASS A",
          510n,
          5n,
          user1.address
        )
      ).to.be.revertedWith("Token rate not set");
    });

    it("reverts when non-owner tries to register plot", async () => {
      await expect(
        token.connect(user1).registerLandPlot(
          "GT1-0001",
          "Gelephu",
          "Gelephu Throm",
          "2583",
          "Owner",
          "12008000663",
          "Family",
          "Private",
          "Urban Core",
          "CLASS A",
          510n,
          5n,
          user1.address
        )
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("updates plot wallet correctly", async () => {
      await token.registerLandPlot(
        "GT1-0001",
        "Gelephu",
        "Gelephu Throm",
        "2583",
        "Owner",
        "12008000663",
        "Family",
        "Private",
        "Urban Core",
        "CLASS A",
        510n,
        5n,
        user1.address
      );

      await expect(token.updatePlotWallet("GT1-0001", user2.address))
        .to.emit(token, "LandPlotUpdated")
        .withArgs("GT1-0001", user2.address);

      const plot = await token.plots("GT1-0001");
      expect(plot.wallet).to.equal(user2.address);
    });

    it("reverts when updating plot with zero address", async () => {
      await token.registerLandPlot(
        "GT1-0001",
        "Gelephu",
        "Gelephu Throm",
        "2583",
        "Owner",
        "12008000663",
        "Family",
        "Private",
        "Urban Core",
        "CLASS A",
        510n,
        5n,
        user1.address
      );

      await expect(
        token.updatePlotWallet("GT1-0001", ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid wallet");
    });

    it("reverts when updating non-existent plot", async () => {
      await expect(token.updatePlotWallet("FAKE-PLOT", user1.address)).to.be
        .revertedWith("Plot not found");
    });
  });

  // ✅ NEW: Inheritance / Nominee (Option A)
  // Assumes you added:
  // - setNomineeForPlot(plotId, nominee)
  // - declarePlotOwnerDeceased(plotId)
  // - claimPlotAsNominee(plotId, newWallet)
  // - events: NomineeSet, OwnerDeclaredDeceased, PlotClaimedByNominee
  // - mapping: inheritancePlans(plotId) -> { nominee, status, ... }
  // - enum status: NONE=0, ACTIVE=1, DECEASED=2, CLAIMED=3
  describe("Inheritance / Nominee (Option A)", () => {
    beforeEach(async () => {
      await token.registerLandPlot(
        "GT1-INHERIT-1",
        "Gelephu",
        "Gelephu Throm",
        "9991",
        "Original Owner",
        "11111111111",
        "Family",
        "Private",
        "Urban Core",
        "CLASS A",
        510n,
        5n,
        user1.address
      );
    });

    it("plot wallet can set nominee for a plot", async () => {
      await expect(
        token.connect(user1).setNomineeForPlot("GT1-INHERIT-1", user2.address)
      )
        .to.emit(token, "NomineeSet")
        .withArgs("GT1-INHERIT-1", user1.address, user2.address);

      const plan = await token.inheritancePlans("GT1-INHERIT-1");
      expect(plan.nominee).to.equal(user2.address);
      expect(plan.status).to.equal(1n); // ACTIVE
    });

    it("reverts when non-plot-wallet tries to set nominee", async () => {
      await expect(
        token.connect(user3).setNomineeForPlot("GT1-INHERIT-1", user2.address)
      ).to.be.revertedWith("Only plot wallet");
    });

    it("reverts when setting nominee to zero address", async () => {
      await expect(
        token
          .connect(user1)
          .setNomineeForPlot("GT1-INHERIT-1", ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid nominee");
    });

    it("admin can declare plot owner deceased (after nominee set)", async () => {
      await token.connect(user1).setNomineeForPlot("GT1-INHERIT-1", user2.address);

      await expect(token.declarePlotOwnerDeceased("GT1-INHERIT-1"))
        .to.emit(token, "OwnerDeclaredDeceased")
        .withArgs("GT1-INHERIT-1", owner.address, user2.address);

      const plan = await token.inheritancePlans("GT1-INHERIT-1");
      expect(plan.status).to.equal(2n); // DECEASED
    });

    it("reverts when non-owner declares deceased", async () => {
      await token.connect(user1).setNomineeForPlot("GT1-INHERIT-1", user2.address);

      await expect(
        token.connect(user1).declarePlotOwnerDeceased("GT1-INHERIT-1")
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("reverts when declaring deceased without active nominee", async () => {
      await expect(token.declarePlotOwnerDeceased("GT1-INHERIT-1")).to.be
        .revertedWith("No active nominee");
    });

    it("nominee can claim plot and set new wallet after deceased", async () => {
      await token.connect(user1).setNomineeForPlot("GT1-INHERIT-1", user2.address);
      await token.declarePlotOwnerDeceased("GT1-INHERIT-1");

      await expect(
        token.connect(user2).claimPlotAsNominee("GT1-INHERIT-1", user3.address)
      )
        .to.emit(token, "PlotClaimedByNominee")
        .withArgs("GT1-INHERIT-1", user2.address, user1.address, user3.address);

      const plot = await token.plots("GT1-INHERIT-1");
      expect(plot.wallet).to.equal(user3.address);

      const plan = await token.inheritancePlans("GT1-INHERIT-1");
      expect(plan.status).to.equal(3n); // CLAIMED
    });

    it("reverts when non-nominee tries to claim", async () => {
      await token.connect(user1).setNomineeForPlot("GT1-INHERIT-1", user2.address);
      await token.declarePlotOwnerDeceased("GT1-INHERIT-1");

      await expect(
        token.connect(user3).claimPlotAsNominee("GT1-INHERIT-1", user3.address)
      ).to.be.revertedWith("Only nominee");
    });

    it("reverts when claiming before deceased declaration", async () => {
      await token.connect(user1).setNomineeForPlot("GT1-INHERIT-1", user2.address);

      await expect(
        token.connect(user2).claimPlotAsNominee("GT1-INHERIT-1", user3.address)
      ).to.be.revertedWith("Not claimable");
    });

    it("reverts when claiming with zero new wallet", async () => {
      await token.connect(user1).setNomineeForPlot("GT1-INHERIT-1", user2.address);
      await token.declarePlotOwnerDeceased("GT1-INHERIT-1");

      await expect(
        token
          .connect(user2)
          .claimPlotAsNominee("GT1-INHERIT-1", ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid new wallet");
    });
  });

  describe("Token Allocation from Plot", () => {
    beforeEach(async () => {
      await token.registerLandPlot(
        "GT1-0001",
        "Gelephu",
        "Gelephu Throm",
        "2583",
        "Owner",
        "12008000663",
        "Family",
        "Private",
        "Urban Core",
        "CLASS A",
        510n,
        5n,
        user1.address
      );
    });

    it("allows owner to allocate additional tokens from plot", async () => {
      const additionalTokens = 3n * ONE_TOKEN;

      await expect(
        token.allocateTokensFromPlot("GT1-0001", user2.address, additionalTokens)
      )
        .to.emit(token, "TokensAllocatedFromPlot")
        .withArgs("GT1-0001", user2.address, additionalTokens);

      const bal = await token.balanceOf(user2.address);
      expect(bal).to.equal(additionalTokens);

      const tokensFromPlot = await token.tokensFromPlot(
        user2.address,
        "GT1-0001"
      );
      expect(tokensFromPlot).to.equal(additionalTokens);
    });

    it("reverts when allocating from non-existent plot", async () => {
      await expect(
        token.allocateTokensFromPlot("FAKE-PLOT", user1.address, ONE_TOKEN)
      ).to.be.revertedWith("Plot not found");
    });

    it("reverts when allocating to zero address", async () => {
      await expect(
        token.allocateTokensFromPlot("GT1-0001", ethers.ZeroAddress, ONE_TOKEN)
      ).to.be.revertedWith("Invalid wallet");
    });

    it("reverts when allocating zero amount", async () => {
      await expect(
        token.allocateTokensFromPlot("GT1-0001", user1.address, 0n)
      ).to.be.revertedWith("Amount must be > 0");
    });
  });

  describe("Token Transfers", () => {
    it("tracks per-plot balances when transferring tokens between users", async () => {
      const landValue = 10n;
      const totalTokens = landValue * ONE_TOKEN;

      await token.registerLandPlot(
        "GT1-0002",
        "Gelephu",
        "Gelephu Throm",
        "3000",
        "Owner A",
        "11111111111",
        "Family Ownership",
        "Private",
        "Urban Core",
        "CLASS B",
        800n,
        landValue,
        user1.address
      );

      const transferAmount = 3n * ONE_TOKEN;
      await token.connect(user1).transfer(user2.address, transferAmount);

      const bal1 = await token.balanceOf(user1.address);
      const bal2 = await token.balanceOf(user2.address);

      expect(bal1).to.equal(totalTokens - transferAmount);
      expect(bal2).to.equal(transferAmount);

      const fromPlotUser1 = await token.tokensFromPlot(
        user1.address,
        "GT1-0002"
      );
      const fromPlotUser2 = await token.tokensFromPlot(
        user2.address,
        "GT1-0002"
      );

      expect(fromPlotUser1).to.equal(totalTokens - transferAmount);
      expect(fromPlotUser2).to.equal(transferAmount);
    });

    it("handles transfer when sender has tokens from multiple plots", async () => {
      await token.registerLandPlot(
        "GT1-MULTI-1",
        "Gelephu",
        "Gelephu Throm",
        "1000",
        "Owner",
        "11111111111",
        "Family",
        "Private",
        "Urban Core",
        "CLASS A",
        500n,
        5n,
        user1.address
      );

      await token.registerLandPlot(
        "GT1-MULTI-2",
        "Gelephu",
        "Gelephu Throm",
        "2000",
        "Owner",
        "11111111111",
        "Family",
        "Private",
        "Urban Core",
        "CLASS B",
        600n,
        7n,
        user1.address
      );

      const totalTokens = 12n * ONE_TOKEN;
      const transferAmount = 8n * ONE_TOKEN;

      await token.connect(user1).transfer(user2.address, transferAmount);

      const bal1 = await token.balanceOf(user1.address);
      const bal2 = await token.balanceOf(user2.address);

      expect(bal1).to.equal(totalTokens - transferAmount);
      expect(bal2).to.equal(transferAmount);

      const fromPlot1User2 = await token.tokensFromPlot(
        user2.address,
        "GT1-MULTI-1"
      );
      const fromPlot2User2 = await token.tokensFromPlot(
        user2.address,
        "GT1-MULTI-2"
      );

      expect(fromPlot1User2).to.equal(5n * ONE_TOKEN);
      expect(fromPlot2User2).to.equal(3n * ONE_TOKEN);
    });

    it("allows transfer of adminMinted tokens", async () => {
      const mintAmount = 10n * ONE_TOKEN;
      await token.adminMint(user1.address, mintAmount);

      const transferAmount = 5n * ONE_TOKEN;
      await token.connect(user1).transfer(user2.address, transferAmount);

      const bal1 = await token.balanceOf(user1.address);
      const bal2 = await token.balanceOf(user2.address);

      expect(bal1).to.equal(mintAmount - transferAmount);
      expect(bal2).to.equal(transferAmount);
    });
  });

  describe("Marketplace - Sell Orders", () => {
    beforeEach(async () => {
      await token.registerLandPlot(
        "GT1-MARKET",
        "Gelephu",
        "Gelephu Throm",
        "5000",
        "Seller",
        "33333333333",
        "Individual",
        "Private",
        "Urban Core",
        "CLASS D",
        900n,
        10n,
        user1.address
      );
    });

    it("createSellOrder moves tokens to contract and tracks sell order", async () => {
      const totalTokens = 10n * ONE_TOKEN;
      const amountToSell = 5n * ONE_TOKEN;
      const pricePerTokenWei = ONE_ETHER;

      const tx = await token
        .connect(user1)
        .createSellOrder(amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find(
        (l) => l.fragment && l.fragment.name === "SellOrderCreated"
      );
      const orderId = event.args.orderId;

      expect(event.args.seller).to.equal(user1.address);
      expect(event.args.amount).to.equal(amountToSell);
      expect(event.args.pricePerTokenWei).to.equal(pricePerTokenWei);

      const order = await token.sellOrders(orderId);
      expect(order.seller).to.equal(user1.address);
      expect(order.amountTotal).to.equal(amountToSell);
      expect(order.amountRemaining).to.equal(amountToSell);
      expect(order.active).to.equal(true);

      const balUser1 = await token.balanceOf(user1.address);
      const balContract = await token.balanceOf(await token.getAddress());

      expect(balUser1).to.equal(totalTokens - amountToSell);
      expect(balContract).to.equal(amountToSell);

      const fromPlotUser1 = await token.tokensFromPlot(
        user1.address,
        "GT1-MARKET"
      );
      const fromPlotContract = await token.tokensFromPlot(
        await token.getAddress(),
        "GT1-MARKET"
      );

      expect(fromPlotUser1).to.equal(totalTokens - amountToSell);
      expect(fromPlotContract).to.equal(amountToSell);
    });

    it("reverts when creating sell order with zero amount", async () => {
      await expect(
        token.connect(user1).createSellOrder(0n, ONE_ETHER)
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("reverts when creating sell order with zero price", async () => {
      await expect(
        token.connect(user1).createSellOrder(ONE_TOKEN, 0n)
      ).to.be.revertedWith("Price must be > 0");
    });

    it("buyFromOrder transfers tokens, updates proceeds and per-plot balances", async () => {
      const totalTokens = 10n * ONE_TOKEN;
      const amountToSell = 4n * ONE_TOKEN;
      const pricePerTokenWei = ONE_ETHER;

      const tx = await token
        .connect(user1)
        .createSellOrder(amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find(
        (l) => l.fragment && l.fragment.name === "SellOrderCreated"
      );
      const orderId = event.args.orderId;

      const totalCost = (amountToSell * pricePerTokenWei) / DECIMALS_FACTOR;
      const sellerStartEth = await ethers.provider.getBalance(user1.address);

      await expect(
        token
          .connect(user2)
          .buyFromOrder(orderId, amountToSell, { value: totalCost })
      )
        .to.emit(token, "SellOrderFilled")
        .withArgs(orderId, user2.address, amountToSell, totalCost);

      const order = await token.sellOrders(orderId);
      expect(order.amountRemaining).to.equal(0n);
      expect(order.active).to.equal(false);

      const balSellerTokens = await token.balanceOf(user1.address);
      const balBuyerTokens = await token.balanceOf(user2.address);
      const balContractTokens = await token.balanceOf(await token.getAddress());

      expect(balSellerTokens).to.equal(totalTokens - amountToSell);
      expect(balBuyerTokens).to.equal(amountToSell);
      expect(balContractTokens).to.equal(0n);

      const proceeds = await token.totalProceeds(user1.address);
      expect(proceeds).to.equal(totalCost);

      const tokensBought = await token.tokensBought(user2.address);
      const tokensSold = await token.tokensSold(user1.address);
      expect(tokensBought).to.equal(amountToSell);
      expect(tokensSold).to.equal(amountToSell);

      const fromPlotSeller = await token.tokensFromPlot(
        user1.address,
        "GT1-MARKET"
      );
      const fromPlotBuyer = await token.tokensFromPlot(
        user2.address,
        "GT1-MARKET"
      );

      expect(fromPlotSeller).to.equal(totalTokens - amountToSell);
      expect(fromPlotBuyer).to.equal(amountToSell);

      const sellerEndEth = await ethers.provider.getBalance(user1.address);
      expect(sellerEndEth).to.be.greaterThan(sellerStartEth);
    });

    it("handles partial sell order fills correctly", async () => {
      const amountToSell = 10n * ONE_TOKEN;
      const pricePerTokenWei = ONE_ETHER;

      const tx = await token
        .connect(user1)
        .createSellOrder(amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find(
        (l) => l.fragment && l.fragment.name === "SellOrderCreated"
      );
      const orderId = event.args.orderId;

      const partialAmount = 3n * ONE_TOKEN;
      const partialCost = (partialAmount * pricePerTokenWei) / DECIMALS_FACTOR;

      await token
        .connect(user2)
        .buyFromOrder(orderId, partialAmount, { value: partialCost });

      const order = await token.sellOrders(orderId);
      expect(order.amountRemaining).to.equal(amountToSell - partialAmount);
      expect(order.active).to.equal(true);

      const balBuyer = await token.balanceOf(user2.address);
      expect(balBuyer).to.equal(partialAmount);

      const remainingCost =
        (order.amountRemaining * pricePerTokenWei) / DECIMALS_FACTOR;
      await token
        .connect(user3)
        .buyFromOrder(orderId, order.amountRemaining, { value: remainingCost });

      const finalOrder = await token.sellOrders(orderId);
      expect(finalOrder.amountRemaining).to.equal(0n);
      expect(finalOrder.active).to.equal(false);
    });

    it("refunds excess ETH to buyer", async () => {
      const amountToSell = 2n * ONE_TOKEN;
      const pricePerTokenWei = ONE_ETHER;

      const tx = await token
        .connect(user1)
        .createSellOrder(amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find(
        (l) => l.fragment && l.fragment.name === "SellOrderCreated"
      );
      const orderId = event.args.orderId;

      const totalCost = (amountToSell * pricePerTokenWei) / DECIMALS_FACTOR;
      const excessAmount = ONE_ETHER;
      const buyerStartEth = await ethers.provider.getBalance(user2.address);

      const buyTx = await token
        .connect(user2)
        .buyFromOrder(orderId, amountToSell, {
          value: totalCost + excessAmount,
        });
      const buyReceipt = await buyTx.wait();
      const gasCost = buyReceipt.gasUsed * buyReceipt.gasPrice;

      const buyerEndEth = await ethers.provider.getBalance(user2.address);

      expect(buyerStartEth - buyerEndEth).to.be.closeTo(
        totalCost + gasCost,
        ONE_ETHER / 1000n
      );
    });

    it("reverts when buying with insufficient payment", async () => {
      const amountToSell = 5n * ONE_TOKEN;
      const pricePerTokenWei = ONE_ETHER;

      const tx = await token
        .connect(user1)
        .createSellOrder(amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find(
        (l) => l.fragment && l.fragment.name === "SellOrderCreated"
      );
      const orderId = event.args.orderId;

      const totalCost = (amountToSell * pricePerTokenWei) / DECIMALS_FACTOR;
      const insufficientPayment = totalCost - ONE_ETHER;

      await expect(
        token
          .connect(user2)
          .buyFromOrder(orderId, amountToSell, { value: insufficientPayment })
      ).to.be.revertedWith("Insufficient payment");
    });

    it("reverts when buying from inactive order", async () => {
      const amountToSell = 5n * ONE_TOKEN;
      const pricePerTokenWei = ONE_ETHER;

      const tx = await token
        .connect(user1)
        .createSellOrder(amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find(
        (l) => l.fragment && l.fragment.name === "SellOrderCreated"
      );
      const orderId = event.args.orderId;

      await token.connect(user1).cancelSellOrder(orderId);

      const totalCost = (amountToSell * pricePerTokenWei) / DECIMALS_FACTOR;

      await expect(
        token.connect(user2).buyFromOrder(orderId, amountToSell, { value: totalCost })
      ).to.be.revertedWith("Order not active");
    });

    it("reverts when buying more than available in order", async () => {
      const amountToSell = 5n * ONE_TOKEN;
      const pricePerTokenWei = ONE_ETHER;

      const tx = await token
        .connect(user1)
        .createSellOrder(amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find(
        (l) => l.fragment && l.fragment.name === "SellOrderCreated"
      );
      const orderId = event.args.orderId;

      const excessAmount = 10n * ONE_TOKEN;
      const totalCost = (excessAmount * pricePerTokenWei) / DECIMALS_FACTOR;

      await expect(
        token.connect(user2).buyFromOrder(orderId, excessAmount, { value: totalCost })
      ).to.be.revertedWith("Not enough tokens in order");
    });

    it("reverts when buying zero amount", async () => {
      const amountToSell = 5n * ONE_TOKEN;
      const pricePerTokenWei = ONE_ETHER;

      const tx = await token
        .connect(user1)
        .createSellOrder(amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find(
        (l) => l.fragment && l.fragment.name === "SellOrderCreated"
      );
      const orderId = event.args.orderId;

      await expect(
        token.connect(user2).buyFromOrder(orderId, 0n, { value: 0 })
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("cancelSellOrder returns remaining tokens to seller", async () => {
      const totalTokens = 10n * ONE_TOKEN;
      const amountToSell = 4n * ONE_TOKEN;
      const pricePerTokenWei = ONE_ETHER;

      const tx = await token
        .connect(user1)
        .createSellOrder(amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find(
        (l) => l.fragment && l.fragment.name === "SellOrderCreated"
      );
      const orderId = event.args.orderId;

      await expect(token.connect(user1).cancelSellOrder(orderId))
        .to.emit(token, "SellOrderCancelled")
        .withArgs(orderId, user1.address, amountToSell);

      const order = await token.sellOrders(orderId);
      expect(order.active).to.equal(false);
      expect(order.amountRemaining).to.equal(0n);

      const balSeller = await token.balanceOf(user1.address);
      const balContract = await token.balanceOf(await token.getAddress());

      expect(balSeller).to.equal(totalTokens);
      expect(balContract).to.equal(0n);

      const fromPlotSeller = await token.tokensFromPlot(
        user1.address,
        "GT1-MARKET"
      );
      expect(fromPlotSeller).to.equal(totalTokens);
    });

    it("reverts when non-seller tries to cancel order", async () => {
      const amountToSell = 5n * ONE_TOKEN;
      const pricePerTokenWei = ONE_ETHER;

      const tx = await token
        .connect(user1)
        .createSellOrder(amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find(
        (l) => l.fragment && l.fragment.name === "SellOrderCreated"
      );
      const orderId = event.args.orderId;

      await expect(token.connect(user2).cancelSellOrder(orderId)).to.be
        .revertedWith("Not your order");
    });

    it("reverts when cancelling inactive order", async () => {
      const amountToSell = 5n * ONE_TOKEN;
      const pricePerTokenWei = ONE_ETHER;

      const tx = await token
        .connect(user1)
        .createSellOrder(amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find(
        (l) => l.fragment && l.fragment.name === "SellOrderCreated"
      );
      const orderId = event.args.orderId;

      await token.connect(user1).cancelSellOrder(orderId);

      await expect(token.connect(user1).cancelSellOrder(orderId)).to.be
        .revertedWith("Order not active");
    });
  });

  describe("Admin Functions", () => {
    it("adminMint does not affect per-plot tracking", async () => {
      const mintAmount = 10n * ONE_TOKEN;

      await token.adminMint(user1.address, mintAmount);
      let bal = await token.balanceOf(user1.address);
      expect(bal).to.equal(mintAmount);

      let fromPlot = await token.tokensFromPlot(user1.address, "NON_EXISTENT");
      expect(fromPlot).to.equal(0n);
    });

    it("adminBurn reduces balance correctly", async () => {
      const mintAmount = 10n * ONE_TOKEN;

      await token.adminMint(user1.address, mintAmount);
      await token.adminBurn(user1.address, mintAmount / 2n);

      const bal = await token.balanceOf(user1.address);
      expect(bal).to.equal(mintAmount / 2n);
    });

    it("reverts when non-owner calls adminMint", async () => {
      await expect(
        token.connect(user1).adminMint(user2.address, ONE_TOKEN)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("reverts when non-owner calls adminBurn", async () => {
      await token.adminMint(user1.address, ONE_TOKEN);

      await expect(
        token.connect(user1).adminBurn(user1.address, ONE_TOKEN)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });
  });

  describe("User Info Functions", () => {
    it("getMyInfo returns correct summary for caller", async () => {
      const landValue = 3n;
      const totalTokens = landValue * ONE_TOKEN;

      await token.registerLandPlot(
        "GT1-MYINFO",
        "Gelephu",
        "Gelephu Throm",
        "7000",
        "User1",
        "55555555555",
        "Family",
        "Private",
        "Urban Core",
        "CLASS F",
        400n,
        landValue,
        user1.address
      );

      const [
        tokenBalance,
        totalEarned,
        totalTokensBought,
        totalTokensSold,
        myPlots,
        fullPlotDetails,
      ] = await token.connect(user1).getMyInfo();

      expect(tokenBalance).to.equal(totalTokens);
      expect(totalEarned).to.equal(0n);
      expect(totalTokensBought).to.equal(0n);
      expect(totalTokensSold).to.equal(0n);

      expect(myPlots.length).to.equal(1);
      expect(myPlots[0]).to.equal("GT1-MYINFO");

      expect(fullPlotDetails.length).to.equal(1);
      expect(fullPlotDetails[0].plotId).to.equal("GT1-MYINFO");
      expect(fullPlotDetails[0].myTokensFromThisPlot).to.equal(totalTokens);
    });

    it("getMyInfo reflects trading activity", async () => {
      const landValue = 10n;

      await token.registerLandPlot(
        "GT1-TRADE",
        "Gelephu",
        "Gelephu Throm",
        "8000",
        "Trader",
        "66666666666",
        "Family",
        "Private",
        "Urban Core",
        "CLASS G",
        500n,
        landValue,
        user1.address
      );

      const amountToSell = 5n * ONE_TOKEN;
      const pricePerTokenWei = ONE_ETHER;

      const tx = await token
        .connect(user1)
        .createSellOrder(amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find(
        (l) => l.fragment && l.fragment.name === "SellOrderCreated"
      );
      const orderId = event.args.orderId;

      const totalCost = (amountToSell * pricePerTokenWei) / DECIMALS_FACTOR;
      await token
        .connect(user2)
        .buyFromOrder(orderId, amountToSell, { value: totalCost });

      const [
        sellerBalance,
        sellerEarned,
        sellerBought,
        sellerSold,
      ] = await token.connect(user1).getMyInfo();

      expect(sellerBalance).to.equal(5n * ONE_TOKEN);
      expect(sellerEarned).to.equal(totalCost);
      expect(sellerBought).to.equal(0n);
      expect(sellerSold).to.equal(amountToSell);

      const [
        buyerBalance,
        buyerEarned,
        buyerBought,
        buyerSold,
      ] = await token.connect(user2).getMyInfo();

      expect(buyerBalance).to.equal(amountToSell);
      expect(buyerEarned).to.equal(0n);
      expect(buyerBought).to.equal(amountToSell);
      expect(buyerSold).to.equal(0n);
    });

    it("getUserPlotBreakdown returns correct summary for any user", async () => {
      const landValue1 = 2n;
      const landValue2 = 4n;

      await token.registerLandPlot(
        "GT1-ADMIN-1",
        "Gelephu",
        "Gelephu Throm",
        "8000",
        "User1",
        "66666666666",
        "Family",
        "Private",
        "Urban Core",
        "CLASS G",
        300n,
        landValue1,
        user1.address
      );

      await token.registerLandPlot(
        "GT1-ADMIN-2",
        "Gelephu",
        "Gelephu Throm",
        "8001",
        "User1",
        "77777777777",
        "Family",
        "Private",
        "Urban Core",
        "CLASS H",
        350n,
        landValue2,
        user1.address
      );

      const transferAmount = 1n * ONE_TOKEN;
      await token.connect(user1).transfer(user2.address, transferAmount);

      const [
        tokenBalance1,
        totalEarned1,
        totalTokensBought1,
        totalTokensSold1,
        plotIds1,
        plotDetails1,
      ] = await token.getUserPlotBreakdown(user1.address);

      expect(tokenBalance1).to.equal(
        (landValue1 + landValue2) * ONE_TOKEN - transferAmount
      );
      expect(totalEarned1).to.equal(0n);
      expect(totalTokensBought1).to.equal(0n);
      expect(totalTokensSold1).to.equal(0n);
      expect(plotIds1.length).to.equal(2);
      expect(plotDetails1.length).to.equal(2);

      const [
        tokenBalance2,
        totalEarned2,
        totalTokensBought2,
        totalTokensSold2,
        plotIds2,
        plotDetails2,
      ] = await token.getUserPlotBreakdown(user2.address);

      expect(tokenBalance2).to.equal(transferAmount);
      expect(totalEarned2).to.equal(0n);
      expect(totalTokensBought2).to.equal(0n);
      expect(totalTokensSold2).to.equal(0n);
      expect(plotIds2.length).to.equal(1);
      expect(plotDetails2.length).to.equal(1);

      expect(plotDetails2[0].myTokensFromThisPlot).to.equal(transferAmount);
    });

    it("getMyInfo shows only plots with current balance", async () => {
      const landValue = 5n;

      await token.registerLandPlot(
        "GT1-TRANSFER-OUT",
        "Gelephu",
        "Gelephu Throm",
        "9000",
        "Owner",
        "88888888888",
        "Family",
        "Private",
        "Urban Core",
        "CLASS I",
        400n,
        landValue,
        user1.address
      );

      await token
        .connect(user1)
        .transfer(user2.address, landValue * ONE_TOKEN);

      const [
        tokenBalance,
        ,
        ,
        ,
        myPlots,
        fullPlotDetails,
      ] = await token.connect(user1).getMyInfo();

      expect(tokenBalance).to.equal(0n);
      expect(myPlots.length).to.equal(0);
      expect(fullPlotDetails.length).to.equal(0);
    });
  });

  describe("Edge Cases and Integration", () => {
    it("handles complex multi-user multi-plot scenario", async () => {
      await token.registerLandPlot(
        "GT1-COMPLEX-1",
        "Gelephu",
        "Gelephu Throm",
        "1000",
        "Owner1",
        "11111111111",
        "Family",
        "Private",
        "Urban Core",
        "CLASS A",
        500n,
        10n,
        user1.address
      );

      await token.registerLandPlot(
        "GT1-COMPLEX-2",
        "Gelephu",
        "Gelephu Throm",
        "2000",
        "Owner2",
        "22222222222",
        "Family",
        "Private",
        "Urban Core",
        "CLASS B",
        600n,
        15n,
        user2.address
      );

      const sellAmount = 5n * ONE_TOKEN;
      const pricePerToken = ONE_ETHER / 2n;

      const tx = await token
        .connect(user1)
        .createSellOrder(sellAmount, pricePerToken);
      const rc = await tx.wait();
      const event = rc.logs.find(
        (l) => l.fragment && l.fragment.name === "SellOrderCreated"
      );
      const orderId = event.args.orderId;

      const buyAmount = 3n * ONE_TOKEN;
      const cost = (buyAmount * pricePerToken) / DECIMALS_FACTOR;
      await token.connect(user3).buyFromOrder(orderId, buyAmount, { value: cost });

      await token.connect(user2).transfer(user3.address, 5n * ONE_TOKEN);

      const bal1 = await token.balanceOf(user1.address);
      const bal2 = await token.balanceOf(user2.address);
      const bal3 = await token.balanceOf(user3.address);

      expect(bal1).to.equal(5n * ONE_TOKEN);
      expect(bal2).to.equal(10n * ONE_TOKEN);
      expect(bal3).to.equal(8n * ONE_TOKEN);

      const user3FromPlot1 = await token.tokensFromPlot(
        user3.address,
        "GT1-COMPLEX-1"
      );
      const user3FromPlot2 = await token.tokensFromPlot(
        user3.address,
        "GT1-COMPLEX-2"
      );

      expect(user3FromPlot1).to.equal(3n * ONE_TOKEN);
      expect(user3FromPlot2).to.equal(5n * ONE_TOKEN);
    });

    it("handles zero token operations gracefully", async () => {
      await token.registerLandPlot(
        "GT1-ZERO",
        "Gelephu",
        "Gelephu Throm",
        "1000",
        "Owner",
        "99999999999",
        "Family",
        "Private",
        "Urban Core",
        "CLASS Z",
        100n,
        1n,
        user1.address
      );

      await expect(token.connect(user1).transfer(user2.address, 0n)).to.not.be
        .reverted;

      const bal1 = await token.balanceOf(user1.address);
      const bal2 = await token.balanceOf(user2.address);

      expect(bal1).to.equal(ONE_TOKEN);
      expect(bal2).to.equal(0n);
    });

    it("contract can receive ETH", async () => {
      const amount = ONE_ETHER;

      await expect(
        owner.sendTransaction({
          to: await token.getAddress(),
          value: amount,
        })
      ).to.not.be.reverted;

      const balance = await ethers.provider.getBalance(await token.getAddress());
      expect(balance).to.be.at.least(amount);
    });
  });

  describe("Gas Efficiency Considerations", () => {
    it("handles multiple plots without excessive gas usage", async () => {
      for (let i = 0; i < 5; i++) {
        await token.registerLandPlot(
          `GT1-GAS-${i}`,
          "Gelephu",
          "Gelephu Throm",
          `${1000 + i}`,
          "Owner",
          "11111111111",
          "Family",
          "Private",
          "Urban Core",
          "CLASS A",
          100n,
          2n,
          user1.address
        );
      }

      const tx = await token.connect(user1).transfer(user2.address, 5n * ONE_TOKEN);
      const receipt = await tx.wait();

      expect(receipt.status).to.equal(1);
    });
  });

  describe("Additional Tests", () => {
    it("should prevent zero token transfers with explicit check", async () => {
      await token.registerLandPlot(
        "GT1-ZERO-TEST",
        "Gelephu",
        "Gelephu Throm",
        "1001",
        "Owner",
        "99999999999",
        "Family",
        "Private",
        "Urban Core",
        "CLASS Z",
        100n,
        1n,
        user1.address
      );

      const bal1Before = await token.balanceOf(user1.address);
      const bal2Before = await token.balanceOf(user2.address);

      await token.connect(user1).transfer(user2.address, 0n);

      expect(await token.balanceOf(user1.address)).to.equal(bal1Before);
      expect(await token.balanceOf(user2.address)).to.equal(bal2Before);
    });

    it("should handle multiple sequential transactions", async () => {
      await token.registerLandPlot(
        "GT1-SEQ-1",
        "Gelephu",
        "Gelephu Throm",
        "2001",
        "Owner",
        "11111111111",
        "Family",
        "Private",
        "Urban Core",
        "CLASS A",
        100n,
        5n,
        user1.address
      );

      await token.connect(user1).transfer(user2.address, 1n * ONE_TOKEN);
      await token.connect(user2).transfer(user3.address, 1n * ONE_TOKEN);
      await token.connect(user3).transfer(user1.address, 1n * ONE_TOKEN);

      const bal1 = await token.balanceOf(user1.address);
      const bal2 = await token.balanceOf(user2.address);
      const bal3 = await token.balanceOf(user3.address);

      expect(bal1 + bal2 + bal3).to.equal(5n * ONE_TOKEN);
    });

    it("should track proceeds correctly with multiple sales", async () => {
      await token.registerLandPlot(
        "GT1-MULTI-SALE",
        "Gelephu",
        "Gelephu Throm",
        "3001",
        "Seller",
        "22222222222",
        "Family",
        "Private",
        "Urban Core",
        "CLASS B",
        200n,
        20n,
        user1.address
      );

      const price = ONE_ETHER / 2n;

      const tx1 = await token.connect(user1).createSellOrder(10n * ONE_TOKEN, price);
      const rc1 = await tx1.wait();
      const event1 = rc1.logs.find((l) => l.fragment && l.fragment.name === "SellOrderCreated");
      const orderId1 = event1.args.orderId;

      const cost1 = (5n * ONE_TOKEN * price) / DECIMALS_FACTOR;
      await token.connect(user2).buyFromOrder(orderId1, 5n * ONE_TOKEN, { value: cost1 });

      const tx2 = await token.connect(user1).createSellOrder(5n * ONE_TOKEN, price);
      const rc2 = await tx2.wait();
      const event2 = rc2.logs.find((l) => l.fragment && l.fragment.name === "SellOrderCreated");
      const orderId2 = event2.args.orderId;

      const cost2 = (5n * ONE_TOKEN * price) / DECIMALS_FACTOR;
      await token.connect(user3).buyFromOrder(orderId2, 5n * ONE_TOKEN, { value: cost2 });

      const proceeds = await token.totalProceeds(user1.address);
      expect(proceeds).to.equal(cost1 + cost2);
    });

    it("should correctly allocate tokens across multiple plots in transfers", async () => {
      await token.registerLandPlot(
        "GT1-ALLOC-1",
        "Gelephu",
        "Gelephu Throm",
        "4001",
        "Owner",
        "33333333333",
        "Family",
        "Private",
        "Urban Core",
        "CLASS C",
        300n,
        8n,
        user1.address
      );

      await token.registerLandPlot(
        "GT1-ALLOC-2",
        "Gelephu",
        "Gelephu Throm",
        "4002",
        "Owner",
        "44444444444",
        "Family",
        "Private",
        "Urban Core",
        "CLASS D",
        400n,
        12n,
        user1.address
      );

      const transferAmount = 15n * ONE_TOKEN;
      await token.connect(user1).transfer(user2.address, transferAmount);

      const user2FromPlot1 = await token.tokensFromPlot(user2.address, "GT1-ALLOC-1");
      const user2FromPlot2 = await token.tokensFromPlot(user2.address, "GT1-ALLOC-2");

      expect(user2FromPlot1 + user2FromPlot2).to.equal(transferAmount);
    });

    it("should revert when allocating more tokens than available in sell order", async () => {
      await token.registerLandPlot(
        "GT1-LIMIT-TEST",
        "Gelephu",
        "Gelephu Throm",
        "5001",
        "Owner",
        "55555555555",
        "Family",
        "Private",
        "Urban Core",
        "CLASS E",
        500n,
        3n,
        user1.address
      );

      const amountToSell = 2n * ONE_TOKEN;
      const pricePerToken = ONE_ETHER;

      const tx = await token.connect(user1).createSellOrder(amountToSell, pricePerToken);
      const rc = await tx.wait();
      const event = rc.logs.find((l) => l.fragment && l.fragment.name === "SellOrderCreated");
      const orderId = event.args.orderId;

      const excessAmount = 5n * ONE_TOKEN;
      const cost = (excessAmount * pricePerToken) / DECIMALS_FACTOR;

      await expect(
        token.connect(user2).buyFromOrder(orderId, excessAmount, { value: cost })
      ).to.be.revertedWith("Not enough tokens in order");
    });

    it("should maintain plot tracking after admin operations", async () => {
      await token.registerLandPlot(
        "GT1-ADMIN-TEST",
        "Gelephu",
        "Gelephu Throm",
        "6001",
        "Owner",
        "66666666666",
        "Family",
        "Private",
        "Urban Core",
        "CLASS F",
        600n,
        10n,
        user1.address
      );

      const adminMintAmount = 5n * ONE_TOKEN;
      await token.adminMint(user2.address, adminMintAmount);

      const bal2 = await token.balanceOf(user2.address);
      expect(bal2).to.equal(adminMintAmount);

      await token.adminBurn(user2.address, 2n * ONE_TOKEN);
      const bal2After = await token.balanceOf(user2.address);
      expect(bal2After).to.equal(3n * ONE_TOKEN);
    });

    it("should correctly update plot wallet and preserve token ownership", async () => {
      await token.registerLandPlot(
        "GT1-UPDATE-WALLET",
        "Gelephu",
        "Gelephu Throm",
        "7001",
        "Original Owner",
        "77777777777",
        "Family",
        "Private",
        "Urban Core",
        "CLASS G",
        700n,
        7n,
        user1.address
      );

      const tokensBeforeUpdate = await token.balanceOf(user1.address);

      await token.updatePlotWallet("GT1-UPDATE-WALLET", user2.address);

      const plot = await token.plots("GT1-UPDATE-WALLET");
      expect(plot.wallet).to.equal(user2.address);

      expect(await token.balanceOf(user1.address)).to.equal(tokensBeforeUpdate);
    });

    it("should handle sell order with exact payment", async () => {
      await token.registerLandPlot(
        "GT1-EXACT-PAY",
        "Gelephu",
        "Gelephu Throm",
        "8001",
        "Seller",
        "88888888888",
        "Family",
        "Private",
        "Urban Core",
        "CLASS H",
        800n,
        6n,
        user1.address
      );

      const amountToSell = 3n * ONE_TOKEN;
      const pricePerToken = ONE_ETHER;

      const tx = await token.connect(user1).createSellOrder(amountToSell, pricePerToken);
      const rc = await tx.wait();
      const event = rc.logs.find((l) => l.fragment && l.fragment.name === "SellOrderCreated");
      const orderId = event.args.orderId;

      const exactCost = (amountToSell * pricePerToken) / DECIMALS_FACTOR;

      await token.connect(user2).buyFromOrder(orderId, amountToSell, { value: exactCost });

      const order = await token.sellOrders(orderId);
      expect(order.active).to.equal(false);
      expect(order.amountRemaining).to.equal(0n);
    });
  });

  describe("Plot-Linked Sell Orders (createSellOrderForPlot)", () => {
    beforeEach(async () => {
      await token.registerLandPlot(
        "GT1-PLOT-ORDER",
        "Gelephu",
        "Gelephu Throm",
        "7777",
        "Seller",
        "77777777777",
        "Individual",
        "Private",
        "Urban Core",
        "CLASS A",
        500n,
        10n,
        user1.address
      );
    });

    it("createSellOrderForPlot creates order for specific plot only", async () => {
      const amountToSell = 6n * ONE_TOKEN;
      const pricePerTokenWei = ONE_ETHER;

      const tx = await token
        .connect(user1)
        .createSellOrderForPlot("GT1-PLOT-ORDER", amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find(
        (l) => l.fragment && l.fragment.name === "SellOrderCreatedWithPlot"
      );
      const orderId = event.args[0]; // orderId is first arg

      const order = await token.sellOrders(orderId);
      expect(order.active).to.equal(true);
      expect(order.amountRemaining).to.equal(amountToSell);
      expect(order.seller).to.equal(user1.address);

      const hasPlot = await token.orderHasPlot(orderId);
      const plotId = await token.orderPlotId(orderId);
      expect(hasPlot).to.equal(true);
      expect(plotId).to.equal("GT1-PLOT-ORDER");

      const fromPlotSeller = await token.tokensFromPlot(
        user1.address,
        "GT1-PLOT-ORDER"
      );
      expect(fromPlotSeller).to.equal(10n * ONE_TOKEN - amountToSell);
    });

    it("reverts when creating plot order from non-existent plot", async () => {
      await expect(
        token
          .connect(user1)
          .createSellOrderForPlot("FAKE-PLOT", ONE_TOKEN, ONE_ETHER)
      ).to.be.revertedWith("Plot not found");
    });

    it("buyFromOrder for plot-linked order transfers plot-tagged tokens", async () => {
      const amountToSell = 4n * ONE_TOKEN;
      const pricePerTokenWei = ONE_ETHER;

      const tx = await token
        .connect(user1)
        .createSellOrderForPlot("GT1-PLOT-ORDER", amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find(
        (l) => l.fragment && l.fragment.name === "SellOrderCreatedWithPlot"
      );
      const orderId = event.args.orderId;

      const totalCost = (amountToSell * pricePerTokenWei) / DECIMALS_FACTOR;

      await token
        .connect(user2)
        .buyFromOrder(orderId, amountToSell, { value: totalCost });

      const buyerFromPlot = await token.tokensFromPlot(
        user2.address,
        "GT1-PLOT-ORDER"
      );
      expect(buyerFromPlot).to.equal(amountToSell);

      const order = await token.sellOrders(orderId);
      expect(order.active).to.equal(false);
    });

    it("cancelSellOrder for plot-linked order returns plot tokens", async () => {
      const amountToSell = 5n * ONE_TOKEN;
      const pricePerTokenWei = ONE_ETHER;

      const tx = await token
        .connect(user1)
        .createSellOrderForPlot("GT1-PLOT-ORDER", amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find(
        (l) => l.fragment && l.fragment.name === "SellOrderCreatedWithPlot"
      );
      const orderId = event.args.orderId;

      await expect(token.connect(user1).cancelSellOrder(orderId))
        .to.emit(token, "SellOrderCancelled")
        .withArgs(orderId, user1.address, amountToSell);

      const fromPlot = await token.tokensFromPlot(
        user1.address,
        "GT1-PLOT-ORDER"
      );
      expect(fromPlot).to.equal(10n * ONE_TOKEN);
    });
  });

  describe("Inheritance - claimPlotAsNomineeWithTokens", () => {
    beforeEach(async () => {
      await token.registerLandPlot(
        "GT1-INHERIT-TOKEN",
        "Gelephu",
        "Gelephu Throm",
        "8888",
        "Original Owner",
        "88888888888",
        "Family",
        "Private",
        "Urban Core",
        "CLASS A",
        510n,
        8n,
        user1.address
      );
    });

    it("claimPlotAsNomineeWithTokens transfers plot-tagged tokens to new wallet", async () => {
      const totalTokens = 8n * ONE_TOKEN;

      await token.connect(user1).setNomineeForPlot("GT1-INHERIT-TOKEN", user2.address);
      await token.declarePlotOwnerDeceased("GT1-INHERIT-TOKEN");

      await expect(
        token.connect(user2).claimPlotAsNomineeWithTokens("GT1-INHERIT-TOKEN", user3.address)
      )
        .to.emit(token, "PlotClaimedByNominee")
        .withArgs("GT1-INHERIT-TOKEN", user2.address, user1.address, user3.address);

      const plot = await token.plots("GT1-INHERIT-TOKEN");
      expect(plot.wallet).to.equal(user3.address);

      const balUser1 = await token.balanceOf(user1.address);
      const balUser3 = await token.balanceOf(user3.address);

      expect(balUser1).to.equal(0n);
      expect(balUser3).to.equal(totalTokens);

      const fromPlotUser3 = await token.tokensFromPlot(
        user3.address,
        "GT1-INHERIT-TOKEN"
      );
      expect(fromPlotUser3).to.equal(totalTokens);
    });

    it("claimPlotAsNomineeWithTokens only transfers remaining tokens if some were sold", async () => {
      const totalTokens = 8n * ONE_TOKEN;
      const soldAmount = 3n * ONE_TOKEN;

      // User1 sells some tokens
      const tx = await token
        .connect(user1)
        .createSellOrder(soldAmount, ONE_ETHER);
      const rc = await tx.wait();
      const event = rc.logs.find(
        (l) => l.fragment && l.fragment.name === "SellOrderCreated"
      );
      const orderId = event.args.orderId;

      await token
        .connect(user2)
        .buyFromOrder(orderId, soldAmount, { value: (soldAmount * ONE_ETHER) / DECIMALS_FACTOR });

      // Now user1 has fewer tokens
      const balUser1Before = await token.balanceOf(user1.address);
      expect(balUser1Before).to.equal(totalTokens - soldAmount);

      // Set nominee and claim
      await token.connect(user1).setNomineeForPlot("GT1-INHERIT-TOKEN", user2.address);
      await token.declarePlotOwnerDeceased("GT1-INHERIT-TOKEN");

      await token.connect(user2).claimPlotAsNomineeWithTokens("GT1-INHERIT-TOKEN", user3.address);

      const fromPlotUser3 = await token.tokensFromPlot(
        user3.address,
        "GT1-INHERIT-TOKEN"
      );
      expect(fromPlotUser3).to.equal(totalTokens - soldAmount);
    });

    it("reverts when non-nominee calls claimPlotAsNomineeWithTokens", async () => {
      await token.connect(user1).setNomineeForPlot("GT1-INHERIT-TOKEN", user2.address);
      await token.declarePlotOwnerDeceased("GT1-INHERIT-TOKEN");

      await expect(
        token.connect(user3).claimPlotAsNomineeWithTokens("GT1-INHERIT-TOKEN", user3.address)
      ).to.be.revertedWith("Only nominee");
    });

    it("reverts when claiming before deceased declaration", async () => {
      await token.connect(user1).setNomineeForPlot("GT1-INHERIT-TOKEN", user2.address);

      await expect(
        token.connect(user2).claimPlotAsNomineeWithTokens("GT1-INHERIT-TOKEN", user3.address)
      ).to.be.revertedWith("Not claimable");
    });
  });

  describe("Inheritance - clearNomineeForPlot", () => {
    beforeEach(async () => {
      await token.registerLandPlot(
        "GT1-CLEAR-NOMINEE",
        "Gelephu",
        "Gelephu Throm",
        "9999",
        "Owner",
        "99999999999",
        "Family",
        "Private",
        "Urban Core",
        "CLASS B",
        510n,
        5n,
        user1.address
      );
    });

    it("clearNomineeForPlot removes nominee from plot", async () => {
      await token.connect(user1).setNomineeForPlot("GT1-CLEAR-NOMINEE", user2.address);

      let plan = await token.inheritancePlans("GT1-CLEAR-NOMINEE");
      expect(plan.nominee).to.equal(user2.address);
      expect(plan.status).to.equal(1n); // ACTIVE

      await token.connect(user1).clearNomineeForPlot("GT1-CLEAR-NOMINEE");

      plan = await token.inheritancePlans("GT1-CLEAR-NOMINEE");
      expect(plan.nominee).to.equal(ethers.ZeroAddress);
      expect(plan.status).to.equal(0n); // NONE
    });

    it("reverts when non-plot-wallet tries to clear nominee", async () => {
      await token.connect(user1).setNomineeForPlot("GT1-CLEAR-NOMINEE", user2.address);

      await expect(
        token.connect(user3).clearNomineeForPlot("GT1-CLEAR-NOMINEE")
      ).to.be.revertedWith("Only plot wallet");
    });

    it("reverts when clearing nominee for non-existent plot", async () => {
      await expect(
        token.connect(user1).clearNomineeForPlot("FAKE-PLOT")
      ).to.be.revertedWith("Plot not found");
    });
  });

  describe("Dashboard Helper Functions", () => {
    beforeEach(async () => {
      await token.registerLandPlot(
        "GT1-DASH-1",
        "Gelephu",
        "Gelephu Throm",
        "1111",
        "Owner A",
        "11111111111",
        "Family",
        "Private",
        "Urban Core",
        "CLASS A",
        500n,
        5n,
        user1.address
      );

      await token.registerLandPlot(
        "GT1-DASH-2",
        "Gelephu",
        "Gelephu Throm",
        "2222",
        "Owner B",
        "22222222222",
        "Family",
        "Private",
        "Urban Core",
        "CLASS B",
        600n,
        7n,
        user2.address
      );
    });

    it("getWalletPlots returns all plots for a wallet", async () => {
      const plots = await token.getWalletPlots(user1.address);
      expect(plots.length).to.be.greaterThan(0);
      expect(plots).to.include("GT1-DASH-1");
    });

    it("getAllPlotIds returns all registered plots", async () => {
      const allPlots = await token.getAllPlotIds();
      expect(allPlots.length).to.be.greaterThan(0);
      expect(allPlots).to.include("GT1-DASH-1");
      expect(allPlots).to.include("GT1-DASH-2");
    });

    it("getPlotCount returns correct count of plots", async () => {
      const count = await token.getPlotCount();
      const allPlots = await token.getAllPlotIds();
      expect(count).to.equal(allPlots.length);
    });

    it("getPlotIdAt returns plot at specific index", async () => {
      const plotAt0 = await token.getPlotIdAt(0);
      expect(plotAt0).to.be.a("string");
      expect(plotAt0.length).to.be.greaterThan(0);
    });

    it("reverts when getPlotIdAt index is out of bounds", async () => {
      const count = await token.getPlotCount();
      const outOfBoundsIndex = Number(count) + 100;
      await expect(token.getPlotIdAt(outOfBoundsIndex)).to.be.revertedWith(
        "Index out of bounds"
      );
    });

    it("isPlotIndexed returns true for indexed plots", async () => {
      const isIndexed = await token.isPlotIndexed("GT1-DASH-1");
      expect(isIndexed).to.equal(true);
    });

    it("isPlotIndexed returns false for non-indexed plots", async () => {
      const isIndexed = await token.isPlotIndexed("FAKE-PLOT");
      expect(isIndexed).to.equal(false);
    });
  });

  describe("Admin Dashboard Functions", () => {
    beforeEach(async () => {
      await token.registerLandPlot(
        "GT1-ADMIN-1",
        "Gelephu",
        "Gelephu Throm",
        "3333",
        "Owner",
        "33333333333",
        "Family",
        "Private",
        "Urban Core",
        "CLASS A",
        500n,
        10n,
        user1.address
      );

      await token.registerLandPlot(
        "GT1-ADMIN-2",
        "Gelephu",
        "Gelephu Throm",
        "4444",
        "Owner",
        "44444444444",
        "Family",
        "Private",
        "Urban Core",
        "CLASS B",
        600n,
        8n,
        user2.address
      );
    });

    it("getAllPlotsForAdmin returns all plots with correct details", async () => {
      const allPlots = await token.getAllPlotsForAdmin();
      expect(allPlots.length).to.be.greaterThan(0);

      const plot1 = allPlots.find((p) => p.plotId === "GT1-ADMIN-1");
      expect(plot1).to.exist;
      expect(plot1.ownerName).to.equal("Owner");
      expect(plot1.landValue).to.equal(10n);
      expect(plot1.wallet).to.equal(user1.address);
    });

    it("getAllPlotsForAdmin includes allocatedTokens for each plot", async () => {
      const allPlots = await token.getAllPlotsForAdmin();
      const plot1 = allPlots.find((p) => p.plotId === "GT1-ADMIN-1");
      expect(plot1.allocatedTokens).to.equal(10n * ONE_TOKEN);
    });

    it("getAllPlotsForAdmin myTokensFromThisPlot is zero", async () => {
      const allPlots = await token.getAllPlotsForAdmin();
      const plot1 = allPlots.find((p) => p.plotId === "GT1-ADMIN-1");
      expect(plot1.myTokensFromThisPlot).to.equal(0n);
    });
  });
});
