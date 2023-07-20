/* eslint-disable prefer-const */
import { ONE_BD, ZERO_BD, ZERO_BI } from './constants'
import { Bundle, Pool, Token } from './../types/schema'
import { BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import { exponentToBigDecimal, safeDiv } from '../utils/index'

const WONE_ADDRESS = '0xcF664087a5bB0237a0BAd6742852ec6c8d69A27a'
const USDC_WONE_03_POOL = '0xBC594CABd205bD993e7FfA6F3e9ceA75c1110da5'

// token where amounts should contribute to tracked volume and liquidity
// usually tokens that many tokens are paired with s
export let WHITELIST_TOKENS: string[] = [
  WONE_ADDRESS, // WETH
  '0x1d374ED0700a0aD3cd4945D66a5B1e08e5db20A8', // bscDAI
  '0x7C07d01C9DaB5aBB09CE2b42242a7570F25fC2CC', // arbDAI
  '0xd068722E4e1387E4958300D1e625d2878f784125', // ethDAI
  '0xBC594CABd205bD993e7FfA6F3e9ceA75c1110da5', // ethUSDC
  '0x44cED87b9F1492Bf2DCf5c16004832569f7f6cBa', // bscUSDC
  '0x9b5fae311A4A4b9d838f301C9c27b55d19BAa4Fb', // arbUSDC
  '0x9A89d0e1b051640C6704Dde4dF881f73ADFEf39a', // bscUSDT
  '0x4cC435d7b9557d54d6EF02d69Bbf72634905Bf11', // 1ETH
  '0x783EE3E955832a3D52CA4050c4C251731c156020', // bscETH
  '0x118f50d23810c5E09Ebffb42d7D3328dbF75C2c2', // WBTC
  '0x7aFB0E2ebA6Dc938945FE0f42484d3b8F442D0AC', // ethPAXG
  '0x218532a12a389a4a92fC0C5Fb22901D1c19198aA', // ethLINK
  '0x301259f392B551CA8c592C9f676FCD2f9A0A84C5', // ethMATIC
  '0x6E7bE5B9B4C9953434CD83950D61408f1cCc3bee', // bscMATIC
  '0xDC60CcF6Ae05f898F4255EF580E731b4011100Ec', // bscBNB
  '0x352cd428EFd6F31B5cae636928b7B84149cF369F' // 1CRV
]

let STABLE_COINS: string[] = [
  '0x1Aa1F7815103c0700b98f24138581b88d4cf9769', // bscBUSD
  '0xFeee03BFBAA49dc8d11DDAab8592546018dfb709', // ethBUSD
  '0xBC594CABd205bD993e7FfA6F3e9ceA75c1110da5', // ethUSDC
  '0x44cED87b9F1492Bf2DCf5c16004832569f7f6cBa', // bscUSDC
  '0x9b5fae311A4A4b9d838f301C9c27b55d19BAa4Fb', // arbUSDC
  '0x9A89d0e1b051640C6704Dde4dF881f73ADFEf39a', // bscUSDT
  '0x2DA729BA5231d2C79290aBA4a8b85a5c94dA4724', // arbUSDT
  '0xF2732e8048f1a411C63e2df51d08f4f52E598005'  // ethUSDT
]

let MINIMUM_ETH_LOCKED = BigDecimal.fromString('60')

let Q192 = 2 ** 192
export function sqrtPriceX96ToTokenPrices(sqrtPriceX96: BigInt, token0: Token, token1: Token): BigDecimal[] {
  let num = sqrtPriceX96.times(sqrtPriceX96).toBigDecimal()
  let denom = BigDecimal.fromString(Q192.toString())
  let price1 = num
    .div(denom)
    .times(exponentToBigDecimal(token0.decimals))
    .div(exponentToBigDecimal(token1.decimals))

  let price0 = safeDiv(BigDecimal.fromString('1'), price1)
  return [price0, price1]
}

export function getEthPriceInUSD(): BigDecimal {
  // fetch eth prices for each stablecoin
  let usdcPool = Pool.load(USDC_WONE_03_POOL) // ethUSDC is token0
  if (usdcPool !== null) {
    return usdcPool.token0Price
  } else {
    return ZERO_BD
  }
}

/**
 * Search through graph to find derived Eth per token.
 * @todo update to be derived ETH (add stablecoin estimates)
 **/
export function findEthPerToken(token: Token): BigDecimal {
  if (token.id == WONE_ADDRESS) {
    return ONE_BD
  }
  let whiteList = token.whitelistPools
  // for now just take USD from pool with greatest TVL
  // need to update this to actually detect best rate based on liquidity distribution
  let largestLiquidityETH = ZERO_BD
  let priceSoFar = ZERO_BD
  let bundle = Bundle.load('1')

  // hardcoded fix for incorrect rates
  // if whitelist includes token - get the safe price
  if (STABLE_COINS.includes(token.id)) {
    priceSoFar = safeDiv(ONE_BD, bundle.ethPriceUSD)
  } else {
    for (let i = 0; i < whiteList.length; ++i) {
      let poolAddress = whiteList[i]
      let pool = Pool.load(poolAddress)

      if (pool.liquidity.gt(ZERO_BI)) {
        if (pool.token0 == token.id) {
          // whitelist token is token1
          let token1 = Token.load(pool.token1)
          // get the derived ETH in pool
          let ethLocked = pool.totalValueLockedToken1.times(token1.derivedETH)
          if (ethLocked.gt(largestLiquidityETH) && ethLocked.gt(MINIMUM_ETH_LOCKED)) {
            largestLiquidityETH = ethLocked
            // token1 per our token * Eth per token1
            priceSoFar = pool.token1Price.times(token1.derivedETH as BigDecimal)
          }
        }
        if (pool.token1 == token.id) {
          let token0 = Token.load(pool.token0)
          // get the derived ETH in pool
          let ethLocked = pool.totalValueLockedToken0.times(token0.derivedETH)
          if (ethLocked.gt(largestLiquidityETH) && ethLocked.gt(MINIMUM_ETH_LOCKED)) {
            largestLiquidityETH = ethLocked
            // token0 per our token * ETH per token0
            priceSoFar = pool.token0Price.times(token0.derivedETH as BigDecimal)
          }
        }
      }
    }
  }
  return priceSoFar // nothing was found return 0
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 */
export function getTrackedAmountUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let bundle = Bundle.load('1')
  let price0USD = token0.derivedETH.times(bundle.ethPriceUSD)
  let price1USD = token1.derivedETH.times(bundle.ethPriceUSD)

  // both are whitelist tokens, return sum of both amounts
  if (WHITELIST_TOKENS.includes(token0.id) && WHITELIST_TOKENS.includes(token1.id)) {
    return tokenAmount0.times(price0USD).plus(tokenAmount1.times(price1USD))
  }

  // take double value of the whitelisted token amount
  if (WHITELIST_TOKENS.includes(token0.id) && !WHITELIST_TOKENS.includes(token1.id)) {
    return tokenAmount0.times(price0USD).times(BigDecimal.fromString('2'))
  }

  // take double value of the whitelisted token amount
  if (!WHITELIST_TOKENS.includes(token0.id) && WHITELIST_TOKENS.includes(token1.id)) {
    return tokenAmount1.times(price1USD).times(BigDecimal.fromString('2'))
  }

  // neither token is on white list, tracked amount is 0
  return ZERO_BD
}
