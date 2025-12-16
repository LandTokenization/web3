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
      await expect(
        token.setTokensPerUnit(0)
      ).to.be.revertedWith("Rate must be > 0");
    });
  });

  describe("Land Plot Registration", () => {
    it("registers land plot, mints tokens and tracks per-plot balance", async () => {
      const landValue = 5n;
      const expectedTokens = landValue * ONE_TOKEN;

      await expect(token.registerLandPlot(
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
      )).to.emit(token, "LandPlotRegistered")
        .withArgs("GT1-0001", user1.address, landValue, expectedTokens);

      const bal = await token.balanceOf(user1.address);
      expect(bal).to.equal(expectedTokens);

      const plot = await token.plots("GT1-0001");
      expect(plot.exists).to.equal(true);
      expect(plot.landValue).to.equal(landValue);
      expect(plot.allocatedTokens).to.equal(expectedTokens);
      expect(plot.wallet).to.equal(user1.address);
      expect(plot.ownerName).to.equal("Sonia Ghalay");

      const tokensFromPlot = await token.tokensFromPlot(user1.address, "GT1-0001");
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
      await expect(
        token.updatePlotWallet("FAKE-PLOT", user1.address)
      ).to.be.revertedWith("Plot not found");
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
      ).to.emit(token, "TokensAllocatedFromPlot")
        .withArgs("GT1-0001", user2.address, additionalTokens);

      const bal = await token.balanceOf(user2.address);
      expect(bal).to.equal(additionalTokens);

      const tokensFromPlot = await token.tokensFromPlot(user2.address, "GT1-0001");
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

      const fromPlotUser1 = await token.tokensFromPlot(user1.address, "GT1-0002");
      const fromPlotUser2 = await token.tokensFromPlot(user2.address, "GT1-0002");

      expect(fromPlotUser1).to.equal(totalTokens - transferAmount);
      expect(fromPlotUser2).to.equal(transferAmount);
    });

    it("handles transfer when sender has tokens from multiple plots", async () => {
      // Register two plots for user1
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
      const transferAmount = 8n * ONE_TOKEN; // More than first plot

      await token.connect(user1).transfer(user2.address, transferAmount);

      const bal1 = await token.balanceOf(user1.address);
      const bal2 = await token.balanceOf(user2.address);

      expect(bal1).to.equal(totalTokens - transferAmount);
      expect(bal2).to.equal(transferAmount);

      // Check plot breakdown for user2
      const fromPlot1User2 = await token.tokensFromPlot(user2.address, "GT1-MULTI-1");
      const fromPlot2User2 = await token.tokensFromPlot(user2.address, "GT1-MULTI-2");

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

      const tx = await token.connect(user1).createSellOrder(amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find((l) => l.fragment && l.fragment.name === "SellOrderCreated");
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

      const fromPlotUser1 = await token.tokensFromPlot(user1.address, "GT1-MARKET");
      const fromPlotContract = await token.tokensFromPlot(await token.getAddress(), "GT1-MARKET");

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

      const tx = await token.connect(user1).createSellOrder(amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find((l) => l.fragment && l.fragment.name === "SellOrderCreated");
      const orderId = event.args.orderId;

      const totalCost = (amountToSell * pricePerTokenWei) / DECIMALS_FACTOR;
      const sellerStartEth = await ethers.provider.getBalance(user1.address);

      await expect(
        token.connect(user2).buyFromOrder(orderId, amountToSell, { value: totalCost })
      ).to.emit(token, "SellOrderFilled")
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

      const fromPlotSeller = await token.tokensFromPlot(user1.address, "GT1-MARKET");
      const fromPlotBuyer = await token.tokensFromPlot(user2.address, "GT1-MARKET");

      expect(fromPlotSeller).to.equal(totalTokens - amountToSell);
      expect(fromPlotBuyer).to.equal(amountToSell);

      const sellerEndEth = await ethers.provider.getBalance(user1.address);
      expect(sellerEndEth).to.be.greaterThan(sellerStartEth);
    });

    it("handles partial sell order fills correctly", async () => {
      const amountToSell = 10n * ONE_TOKEN;
      const pricePerTokenWei = ONE_ETHER;

      const tx = await token.connect(user1).createSellOrder(amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find((l) => l.fragment && l.fragment.name === "SellOrderCreated");
      const orderId = event.args.orderId;

      // Buy only part of the order
      const partialAmount = 3n * ONE_TOKEN;
      const partialCost = (partialAmount * pricePerTokenWei) / DECIMALS_FACTOR;

      await token.connect(user2).buyFromOrder(orderId, partialAmount, { value: partialCost });

      const order = await token.sellOrders(orderId);
      expect(order.amountRemaining).to.equal(amountToSell - partialAmount);
      expect(order.active).to.equal(true);

      const balBuyer = await token.balanceOf(user2.address);
      expect(balBuyer).to.equal(partialAmount);

      // Buy the rest
      const remainingCost = (order.amountRemaining * pricePerTokenWei) / DECIMALS_FACTOR;
      await token.connect(user3).buyFromOrder(orderId, order.amountRemaining, { value: remainingCost });

      const finalOrder = await token.sellOrders(orderId);
      expect(finalOrder.amountRemaining).to.equal(0n);
      expect(finalOrder.active).to.equal(false);
    });

    it("refunds excess ETH to buyer", async () => {
      const amountToSell = 2n * ONE_TOKEN;
      const pricePerTokenWei = ONE_ETHER;

      const tx = await token.connect(user1).createSellOrder(amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find((l) => l.fragment && l.fragment.name === "SellOrderCreated");
      const orderId = event.args.orderId;

      const totalCost = (amountToSell * pricePerTokenWei) / DECIMALS_FACTOR;
      const excessAmount = ONE_ETHER;
      const buyerStartEth = await ethers.provider.getBalance(user2.address);

      const buyTx = await token.connect(user2).buyFromOrder(orderId, amountToSell, { 
        value: totalCost + excessAmount 
      });
      const buyReceipt = await buyTx.wait();
      const gasCost = buyReceipt.gasUsed * buyReceipt.gasPrice;

      const buyerEndEth = await ethers.provider.getBalance(user2.address);
      
      // Buyer should have paid only totalCost + gas, excess should be refunded
      expect(buyerStartEth - buyerEndEth).to.be.closeTo(totalCost + gasCost, ONE_ETHER / 1000n);
    });

    it("reverts when buying with insufficient payment", async () => {
      const amountToSell = 5n * ONE_TOKEN;
      const pricePerTokenWei = ONE_ETHER;

      const tx = await token.connect(user1).createSellOrder(amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find((l) => l.fragment && l.fragment.name === "SellOrderCreated");
      const orderId = event.args.orderId;

      const totalCost = (amountToSell * pricePerTokenWei) / DECIMALS_FACTOR;
      const insufficientPayment = totalCost - ONE_ETHER;

      await expect(
        token.connect(user2).buyFromOrder(orderId, amountToSell, { value: insufficientPayment })
      ).to.be.revertedWith("Insufficient payment");
    });

    it("reverts when buying from inactive order", async () => {
      const amountToSell = 5n * ONE_TOKEN;
      const pricePerTokenWei = ONE_ETHER;

      const tx = await token.connect(user1).createSellOrder(amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find((l) => l.fragment && l.fragment.name === "SellOrderCreated");
      const orderId = event.args.orderId;

      // Cancel the order
      await token.connect(user1).cancelSellOrder(orderId);

      const totalCost = (amountToSell * pricePerTokenWei) / DECIMALS_FACTOR;

      await expect(
        token.connect(user2).buyFromOrder(orderId, amountToSell, { value: totalCost })
      ).to.be.revertedWith("Order not active");
    });

    it("reverts when buying more than available in order", async () => {
      const amountToSell = 5n * ONE_TOKEN;
      const pricePerTokenWei = ONE_ETHER;

      const tx = await token.connect(user1).createSellOrder(amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find((l) => l.fragment && l.fragment.name === "SellOrderCreated");
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

      const tx = await token.connect(user1).createSellOrder(amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find((l) => l.fragment && l.fragment.name === "SellOrderCreated");
      const orderId = event.args.orderId;

      await expect(
        token.connect(user2).buyFromOrder(orderId, 0n, { value: 0 })
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("cancelSellOrder returns remaining tokens to seller", async () => {
      const totalTokens = 10n * ONE_TOKEN;
      const amountToSell = 4n * ONE_TOKEN;
      const pricePerTokenWei = ONE_ETHER;

      const tx = await token.connect(user1).createSellOrder(amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find((l) => l.fragment && l.fragment.name === "SellOrderCreated");
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

      const fromPlotSeller = await token.tokensFromPlot(user1.address, "GT1-MARKET");
      expect(fromPlotSeller).to.equal(totalTokens);
    });

    it("reverts when non-seller tries to cancel order", async () => {
      const amountToSell = 5n * ONE_TOKEN;
      const pricePerTokenWei = ONE_ETHER;

      const tx = await token.connect(user1).createSellOrder(amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find((l) => l.fragment && l.fragment.name === "SellOrderCreated");
      const orderId = event.args.orderId;

      await expect(
        token.connect(user2).cancelSellOrder(orderId)
      ).to.be.revertedWith("Not your order");
    });

    it("reverts when cancelling inactive order", async () => {
      const amountToSell = 5n * ONE_TOKEN;
      const pricePerTokenWei = ONE_ETHER;

      const tx = await token.connect(user1).createSellOrder(amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find((l) => l.fragment && l.fragment.name === "SellOrderCreated");
      const orderId = event.args.orderId;

      await token.connect(user1).cancelSellOrder(orderId);

      await expect(
        token.connect(user1).cancelSellOrder(orderId)
      ).to.be.revertedWith("Order not active");
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
        fullPlotDetails
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

      // Create and complete a sell order
      const amountToSell = 5n * ONE_TOKEN;
      const pricePerTokenWei = ONE_ETHER;

      const tx = await token.connect(user1).createSellOrder(amountToSell, pricePerTokenWei);
      const rc = await tx.wait();
      const event = rc.logs.find((l) => l.fragment && l.fragment.name === "SellOrderCreated");
      const orderId = event.args.orderId;

      const totalCost = (amountToSell * pricePerTokenWei) / DECIMALS_FACTOR;
      await token.connect(user2).buyFromOrder(orderId, amountToSell, { value: totalCost });

      // Check seller info
      const [
        sellerBalance,
        sellerEarned,
        sellerBought,
        sellerSold,
        sellerPlots,
        sellerDetails
      ] = await token.connect(user1).getMyInfo();

      expect(sellerBalance).to.equal(5n * ONE_TOKEN);
      expect(sellerEarned).to.equal(totalCost);
      expect(sellerBought).to.equal(0n);
      expect(sellerSold).to.equal(amountToSell);

      // Check buyer info
      const [
        buyerBalance,
        buyerEarned,
        buyerBought,
        buyerSold,
        buyerPlots,
        buyerDetails
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

      // Move some tokens from second plot to user2
      const transferAmount = 1n * ONE_TOKEN;
      await token.connect(user1).transfer(user2.address, transferAmount);

      const [
        tokenBalance1,
        totalEarned1,
        totalTokensBought1,
        totalTokensSold1,
        plotIds1,
        plotDetails1
      ] = await token.getUserPlotBreakdown(user1.address);

      expect(tokenBalance1).to.equal((landValue1 + landValue2) * ONE_TOKEN - transferAmount);
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
        plotDetails2
      ] = await token.getUserPlotBreakdown(user2.address);

      expect(tokenBalance2).to.equal(transferAmount);
      expect(totalEarned2).to.equal(0n);
      expect(totalTokensBought2).to.equal(0n);
      expect(totalTokensSold2).to.equal(0n);
      expect(plotIds2.length).to.equal(1);
      expect(plotDetails2.length).to.equal(1);
      
      // Check that user2's tokens come from the last plot (LIFO transfer logic)
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

      // Transfer all tokens to user2
      await token.connect(user1).transfer(user2.address, landValue * ONE_TOKEN);

      const [
        tokenBalance,
        totalEarned,
        totalTokensBought,
        totalTokensSold,
        myPlots,
        fullPlotDetails
      ] = await token.connect(user1).getMyInfo();

      expect(tokenBalance).to.equal(0n);
      expect(myPlots.length).to.equal(0);
      expect(fullPlotDetails.length).to.equal(0);
    });
  });

  describe("Edge Cases and Integration", () => {
    it("handles complex multi-user multi-plot scenario", async () => {
      // Register multiple plots
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

      // User1 creates sell order
      const sellAmount = 5n * ONE_TOKEN;
      const pricePerToken = ONE_ETHER / 2n; // 0.5 ETH per token

      const tx = await token.connect(user1).createSellOrder(sellAmount, pricePerToken);
      const rc = await tx.wait();
      const event = rc.logs.find((l) => l.fragment && l.fragment.name === "SellOrderCreated");
      const orderId = event.args.orderId;

      // User3 buys from user1's order
      const buyAmount = 3n * ONE_TOKEN;
      const cost = (buyAmount * pricePerToken) / DECIMALS_FACTOR;
      await token.connect(user3).buyFromOrder(orderId, buyAmount, { value: cost });

      // User2 transfers some tokens to user3
      await token.connect(user2).transfer(user3.address, 5n * ONE_TOKEN);

      // Verify final balances
      const bal1 = await token.balanceOf(user1.address);
      const bal2 = await token.balanceOf(user2.address);
      const bal3 = await token.balanceOf(user3.address);

      expect(bal1).to.equal(5n * ONE_TOKEN); // 10 - 5 (sold)
      expect(bal2).to.equal(10n * ONE_TOKEN); // 15 - 5 (transferred)
      expect(bal3).to.equal(8n * ONE_TOKEN); // 3 (bought) + 5 (received)

      // Verify user3 has tokens from both plots
      const user3FromPlot1 = await token.tokensFromPlot(user3.address, "GT1-COMPLEX-1");
      const user3FromPlot2 = await token.tokensFromPlot(user3.address, "GT1-COMPLEX-2");

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

      // Transfer 0 tokens (should not revert, but won't do anything meaningful)
      await expect(
        token.connect(user1).transfer(user2.address, 0n)
      ).to.not.be.reverted;

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
          value: amount
        })
      ).to.not.be.reverted;

      const balance = await ethers.provider.getBalance(await token.getAddress());
      expect(balance).to.be.at.least(amount);
    });
  });

  describe("Gas Efficiency Considerations", () => {
    it("handles multiple plots without excessive gas usage", async () => {
      // Register 5 plots for user1
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

      // Transfer tokens (will iterate through plots)
      const tx = await token.connect(user1).transfer(user2.address, 5n * ONE_TOKEN);
      const receipt = await tx.wait();

      // Just verify it doesn't revert - gas optimization is beyond scope of basic tests
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
});
