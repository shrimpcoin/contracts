{ // Shrimpcoin v1 
  // Modified version of the ageUSD bank box contract by Emurgo


  
  

  val isExchange = if (CONTEXT.dataInputs.size > 0) {

    val dataInput1 = CONTEXT.dataInputs(0)
    val dataInput2 = CONTEXT.dataInputs(1)
    val validDataInput = (dataInput1.tokens(0)._1 == oraclePoolNFT) && (dataInput2.tokens(0)._1 == shrimpPoolNFT)

    val bankBoxIn = SELF
    val bankBoxOut = OUTPUTS(0)
    
    val rateBox1 = dataInput1
    val rateBox2 = dataInput2

    val receiptBox = OUTPUTS(1)

    //  NANOERG/USD rate
    val dollarERGrate = rateBox1.R4[Long].get 

    // (USD*10^-9)/SHRIMP
    val shrimpUSDrate = rateBox2.R4[Long].get

    // NANOERG/MICROSHRIMP
    val shrimpERGrate = ((shrimpUSDrate * dollarERGrate) / 1000000000) / 1000000

    val scCircIn = bankBoxIn.R4[Long].get
    val rcCircIn = bankBoxIn.R5[Long].get
    val bcReserveIn = bankBoxIn.value

    val scTokensIn = bankBoxIn.tokens(0)._2
    val rcTokensIn = bankBoxIn.tokens(1)._2

    val scCircOut = bankBoxOut.R4[Long].get
    val rcCircOut = bankBoxOut.R5[Long].get
    val bcReserveOut = bankBoxOut.value

    val scTokensOut = bankBoxOut.tokens(0)._2
    val rcTokensOut = bankBoxOut.tokens(1)._2

    val totalScIn = scTokensIn + scCircIn
    val totalScOut = scTokensOut + scCircOut

    val totalRcIn = rcTokensIn + rcCircIn
    val totalRcOut = rcTokensOut + rcCircOut

    val rcExchange = rcTokensIn != rcTokensOut
    val scExchange = scTokensIn != scTokensOut

    val rcExchangeXorScExchange = (rcExchange || scExchange) && !(rcExchange && scExchange)

    val circDelta = receiptBox.R4[Long].get
    val bcReserveDelta = receiptBox.R5[Long].get

    val rcCircDelta = if (rcExchange) circDelta else 0L
    val scCircDelta = if (rcExchange) 0L else circDelta

    val validDeltas = (scCircIn + scCircDelta == scCircOut) &&
                      (rcCircIn + rcCircDelta == rcCircOut) &&
                      (bcReserveIn + bcReserveDelta == bcReserveOut) &&
                      scCircOut >= 0 && rcCircOut >= 0

    val coinsConserved = totalRcIn == totalRcOut && totalScIn == totalScOut

    val tokenIdsConserved = bankBoxOut.tokens(0)._1 == bankBoxIn.tokens(0)._1 && // also ensures that at least one token exists
                            bankBoxOut.tokens(1)._1 == bankBoxIn.tokens(1)._1 && // also ensures that at least one token exists
                            bankBoxOut.tokens(2)._1 == bankBoxIn.tokens(2)._1    // also ensures that at least one token exists

    val mandatoryRateConditions = validDataInput
    val mandatoryBankConditions = bankBoxOut.value >= minStorageRent &&
                                  bankBoxOut.propositionBytes == bankBoxIn.propositionBytes &&
                                  rcExchangeXorScExchange &&
                                  coinsConserved &&
                                  validDeltas &&
                                  tokenIdsConserved

    // exchange equations
    val bcReserveNeededOut = scCircOut * shrimpERGrate 
    val bcReserveNeededIn = scCircIn * shrimpERGrate
    val liabilitiesIn = max(min(bcReserveIn, bcReserveNeededIn), 0)

    val maxReserveRatioPercent = if (HEIGHT > coolingOffHeight) defaultMaxReserveRatioPercent else INF

    val reserveRatioPercentOut = if (bcReserveNeededOut == 0) maxReserveRatioPercent else bcReserveOut * 100 / bcReserveNeededOut

    val validReserveRatio = if (scExchange) {
      if (scCircDelta > 0) {
        reserveRatioPercentOut >= minReserveRatioPercent
      } else true
    } else {
      if (rcCircDelta > 0) {
        reserveRatioPercentOut <= maxReserveRatioPercent
      } else {
        reserveRatioPercentOut >= minReserveRatioPercent
      }
    }

    val brDeltaExpected = if (scExchange) { // sc
      val liableRate = if (scCircIn == 0) longMax else liabilitiesIn / scCircIn
      val scNominalPrice = min(shrimpERGrate, liableRate)
      scNominalPrice * scCircDelta
    } else { // rc
      val equityIn = bcReserveIn - liabilitiesIn
      val equityRate = if (rcCircIn == 0) rcDefaultPrice else equityIn / rcCircIn
      val rcNominalPrice = if (equityIn == 0) rcDefaultPrice else equityRate
      rcNominalPrice * rcCircDelta
    }

    val fee = brDeltaExpected * feePercent / 100

    val actualFee = if (fee < 0) {fee * -1} else fee
    // actualFee is always positive, irrespective of brDeltaExpected

    val brDeltaExpectedWithFee = brDeltaExpected + actualFee
     
    mandatoryRateConditions &&
    mandatoryBankConditions &&
    bcReserveDelta == brDeltaExpectedWithFee &&
    validReserveRatio &&
    validDataInput
    } else false
      
sigmaProp(isExchange || INPUTS(0).tokens(0)._1 == updateNFT && CONTEXT.dataInputs.size == 0)
}
